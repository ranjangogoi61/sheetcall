/**
 * Poll one or more calls and return classified verdicts.
 *
 * CALL-E's Calls API is authoritative for call-execution state — their own
 * reference receiver says so — which is why this app keeps no call database of
 * its own. The browser holds the list; CALL-E holds the truth about the calls.
 */

const runtime = require('../runtime');
const { getCall } = require('../calle');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  let ids = [];
  let config = {};

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    ids = Array.isArray(body.callIds) ? body.callIds : [];
    config = body.config || {};
  } else {
    const single = (req.query && req.query.id) || '';
    if (single) ids = [single];
  }

  if (!ids.length) return res.status(400).json({ error: 'No call ids supplied' });
  if (ids.length > 25) return res.status(400).json({ error: 'Too many call ids in one request' });

  const cfg = { ...runtime.DEFAULT_CONFIG, ...config };
  const out = [];

  for (const callId of ids) {
    const call = await getCall(callId);
    if (!call.ok) {
      out.push({ callId, settled: false, state: 'error', reason: call.error });
      continue;
    }
    if (!runtime.isTerminal(call.body.status)) {
      out.push({ callId, settled: false, apiStatus: call.body.status || 'running' });
      continue;
    }
    const verdict = runtime.classify(call.body, cfg);
    out.push({
      callId,
      settled: true,
      apiStatus: call.body.status,
      state: verdict.state,
      reason: verdict.reason,
      structured: verdict.structured,
      confidence: verdict.confidence,
      confidenceLabel: verdict.confidenceLabel,
      evidence: verdict.evidence,
      source: 'poll'
    });
  }

  res.status(200).json({ results: out });
};
