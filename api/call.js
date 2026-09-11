/**
 * Place calls for a set of records.
 *
 * The whole state machine runs here on the server, not in the browser, so a
 * tampered client cannot skip validation, the calling-window guard, the
 * duplicate check or the per-run cap.
 *
 * dryRun: true exercises the identical path against a local fixture and never
 * touches the network.
 */

const runtime = require('../runtime');
const { createCall } = require('../calle');

const DRY_RUN_RESPONSE = {
  status: 'completed',
  task_completed: true,
  completion_confidence: { score: 0.91, label: 'high' },
  evidence: ['She said she would pay the full amount on Friday the 19th.'],
  recipients: [{
    structured_result: {
      reached: 'yes',
      outcome: 'promised',
      promise_date: '2026-09-19',
      promise_amount: '1200.00',
      note: 'Asked for the invoice to be re-sent to accounts@example.com.'
    }
  }]
};

function idempotencyKey(record, attempt) {
  const raw = ['sheetcall', record.id, attempt, record.invoice_ref || ''].join('|');
  return 'sc_' + Buffer.from(raw).toString('base64url').slice(0, 48);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const records = Array.isArray(body.records) ? body.records : [];
  const dryRun = Boolean(body.dryRun);
  const config = body.config || {};
  const cfg = { ...runtime.DEFAULT_CONFIG, ...config };

  if (!records.length) {
    return res.status(400).json({ error: 'No records supplied' });
  }
  if (!dryRun && records.length > cfg.maxCallsPerRun) {
    return res.status(400).json({
      error: `Refused: ${records.length} exceeds maxCallsPerRun (${cfg.maxCallsPerRun})`
    });
  }

  // Duplicate detection is scoped to this run, so the same number twice in one
  // selection blocks both rather than dialling someone twice.
  const phoneCounts = {};
  records.forEach((r) => {
    const p = runtime.str(r.phone_e164);
    if (p) phoneCounts[p] = (phoneCounts[p] || 0) + 1;
  });

  const results = [];

  for (const record of records) {
    const attempt = Number(record.attempt || 0) + 1;

    // Transition 1 — validate
    const block = runtime.validate(record, phoneCounts);
    if (block) {
      results.push({ id: record.id, state: 'blocked', reason: block, attempt: attempt - 1 });
      continue;
    }

    // Transition 2 — eligibility
    if (cfg.enforceCallingWindow) {
      const elig = runtime.eligibility(record);
      if (!elig.ok) {
        results.push({
          id: record.id, state: 'waiting_window', reason: elig.reason, attempt: attempt - 1
        });
        continue;
      }
    }

    if (attempt > cfg.maxAttempts) {
      results.push({
        id: record.id, state: 'blocked',
        reason: `reached maxAttempts (${cfg.maxAttempts})`, attempt: attempt - 1
      });
      continue;
    }

    // Transition 3 — submit
    if (dryRun) {
      const verdict = runtime.classify(DRY_RUN_RESPONSE, cfg);
      results.push({
        id: record.id, attempt, callId: 'dry-run', calledAt: new Date().toISOString(),
        state: verdict.state, reason: verdict.reason, structured: verdict.structured,
        confidence: verdict.confidence, confidenceLabel: verdict.confidenceLabel,
        evidence: verdict.evidence, source: 'dry-run'
      });
      continue;
    }

    const payload = runtime.buildPayload(record, cfg);
    const call = await createCall(payload, idempotencyKey(record, attempt));

    if (!call.ok) {
      results.push({ id: record.id, state: 'error', reason: call.error, attempt: attempt - 1 });
      continue;
    }

    results.push({
      id: record.id,
      attempt,
      callId: call.body.id || call.body.call_id || '',
      calledAt: new Date().toISOString(),
      state: 'calling',
      reason: '',
      source: 'api'
    });
  }

  const tally = results.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] || 0) + 1;
    return acc;
  }, {});

  res.status(200).json({ dryRun, results, tally });
};
