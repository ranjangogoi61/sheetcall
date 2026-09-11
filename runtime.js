/**
 * SheetCall runtime — the state machine.
 *
 * Storage-agnostic by design. It receives plain record objects, decides what
 * should happen to them, and returns verdicts. It never reads or writes a
 * store, which is why the same logic ran unchanged on the Apps Script adapter
 * and runs here on Vercel.
 *
 *   (empty) ──validate───▶ blocked          bad number · do-not-call · duplicate · locale
 *           ──eligible?──▶ waiting_window   valid, but not a reasonable local hour there
 *           ──submit─────▶ calling          handed to CALL-E
 *                          ├──▶ done        reached, confident, schema-valid
 *                          ├──▶ review      reached, but a human must look
 *                          ├──▶ no_answer   terminal, nobody picked up
 *                          └──▶ error       API or configuration failure
 *   no_answer ──requeue──▶ waiting_window   same person, next eligible window
 */

const { REGIONS } = require('./regions');

const STATES = {
  blocked:        { label: 'Blocked',   note: 'never dialled' },
  waiting_window: { label: 'Waiting',   note: 'outside local calling window' },
  calling:        { label: 'Calling',   note: 'handed to CALL-E' },
  done:           { label: 'Done',      note: 'reached, confident' },
  review:         { label: 'Review',    note: 'reached, needs a human' },
  no_answer:      { label: 'No answer', note: 'nobody picked up' },
  error:          { label: 'Error',     note: 'API or configuration failure' }
};

const TERMINAL_STATES = ['done', 'review', 'no_answer', 'error'];

const DEFAULT_CONFIG = {
  task:
    'You are calling {{name}} on behalf of {{from_business}} about invoice ' +
    '{{invoice_ref}} for {{amount}}, which was due on {{due_date}}. ' +
    'Identify yourself as an automated assistant calling on behalf of ' +
    '{{from_business}}. Ask politely when they expect to pay. If they give a ' +
    'date, confirm it back. If they dispute the invoice or say they already ' +
    'paid, record that instead. Do not negotiate the amount, do not offer a ' +
    'discount, do not accept payment details, and do not threaten any ' +
    'consequence. End the call politely either way.',

  recipientResultSchema: {
    type: 'object',
    required: ['reached', 'outcome'],
    properties: {
      reached: { type: 'string', enum: ['yes', 'no'] },
      outcome: {
        type: 'string',
        enum: ['promised', 'already_paid', 'disputed', 'refused', 'unclear']
      },
      promise_date: { type: 'string' },
      promise_amount: { type: 'string' },
      note: { type: 'string' }
    }
  },

  reviewBelowConfidence: 0.7,
  reviewOutcomes: ['disputed', 'unclear'],
  enforceCallingWindow: true,
  maxCallsPerRun: 10,
  maxAttempts: 3
};

const str = (v) => String(v === undefined || v === null ? '' : v).trim();

/** Transition 1 — validate. Returns a blocking reason, or ''. */
function validate(record, phoneCounts) {
  const phone = str(record.phone_e164);
  const region = str(record.region).toUpperCase();
  const locale = str(record.locale);
  const dnc = record.do_not_call;

  if (dnc === true || (typeof dnc === 'string' && dnc.trim() && !/^(no|false|0)$/i.test(dnc.trim()))) {
    return 'do_not_call is set';
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return 'phone must be E.164, e.g. +15551234567';
  }
  if (!REGIONS[region]) {
    return region
      ? `region ${region} is not in CALL-E's supported list`
      : 'region is required (ISO-2, e.g. US)';
  }
  if (phoneCounts && phoneCounts[phone] > 1) {
    return 'duplicate number in this selection';
  }
  if (locale) {
    const lang = locale.split('-')[0].toLowerCase();
    const supported = REGIONS[region].languages.map((l) => l.slice(0, 2).toLowerCase());
    if (!supported.includes(lang)) {
      return `CALL-E supports ${REGIONS[region].languages.join('/')} for ${region}` +
             ` — locale ${locale} is not available`;
    }
  }
  return '';
}

/**
 * Transition 2 — eligibility. Is it a reasonable hour where they are?
 *
 * The zone comes from the record when present, otherwise from a representative
 * zone for the region. The working week is per-region, so a Gulf record is idle
 * on Friday while a European one is idle on Sunday.
 */
function eligibility(record, now) {
  const region = str(record.region).toUpperCase();
  const meta = REGIONS[region];
  if (!meta) return { ok: false, reason: 'unknown region' };

  const zone = str(record.timezone) || meta.timezone;
  let parts;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    parts = fmt.formatToParts(now || new Date()).reduce((acc, p) => {
      acc[p.type] = p.value; return acc;
    }, {});
  } catch (err) {
    return { ok: false, reason: `unknown timezone: ${zone}` };
  }

  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.weekday];
  const hhmm = `${parts.hour}:${parts.minute}`;

  if (!meta.work_days.includes(dow)) {
    return { ok: false, reason: `not a working day in ${region} (${hhmm} local)` };
  }
  const [from, to] = meta.call_window_local;
  if (hhmm < from || hhmm >= to) {
    return { ok: false, reason: `outside ${from}–${to} local (${hhmm} in ${zone})` };
  }
  return { ok: true, reason: '' };
}

function interpolate(template, record) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    const v = record[key];
    return (v === undefined || v === null || v === '') ? '[not provided]' : String(v);
  });
}

/** Builds the CALL-E request body for one record. */
function buildPayload(record, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const locale = str(record.locale);
  return {
    task: interpolate(cfg.task, record),
    recipients: [{
      phones: [str(record.phone_e164)],
      region: str(record.region).toUpperCase(),
      ...(locale ? { locale } : {})
    }],
    recipient_result_schema: cfg.recipientResultSchema,
    metadata: { source: 'sheetcall', adapter: 'web', record_id: String(record.id || '') }
  };
}

/** Minimal JSON Schema check — required keys and enum membership. */
function validateAgainstSchema(value, schema) {
  const errors = [];
  if (!schema || schema.type !== 'object') return errors;

  (schema.required || []).forEach((key) => {
    if (value[key] === undefined || value[key] === null || value[key] === '') {
      errors.push(`missing "${key}"`);
    }
  });
  Object.keys(schema.properties || {}).forEach((key) => {
    const spec = schema.properties[key];
    const v = value[key];
    if (v === undefined || v === null || v === '') return;
    if (spec.type === 'string' && typeof v !== 'string') errors.push(`"${key}" is not a string`);
    if (spec.enum && !spec.enum.includes(v)) {
      errors.push(`"${key}" = "${v}" is not one of ${spec.enum.join('/')}`);
    }
  });
  return errors;
}

function isTerminal(status) {
  return ['completed', 'failed', 'cancelled', 'canceled', 'no_answer', 'busy']
    .includes(String(status || '').toLowerCase());
}

/**
 * Transition 3 — classify a terminal CALL-E response into a state.
 *
 * An uncertain phone answer never becomes a confident record. It becomes
 * `review`, with the score and the verbatim sentence beside it.
 */
function classify(body, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const recipient = (body.recipients && body.recipients[0]) || {};
  const structured = recipient.structured_result || body.structured_result || {};
  const confidence = body.completion_confidence || {};
  const apiStatus = String(body.status || '').toLowerCase();
  const reached = String(structured.reached || '').toLowerCase();
  const outcome = String(structured.outcome || '').toLowerCase();
  const score = typeof confidence.score === 'number' ? confidence.score : null;
  const schemaErrors = validateAgainstSchema(structured, cfg.recipientResultSchema);

  let state, reason;
  if (apiStatus !== 'completed' || reached === 'no') {
    state = 'no_answer';
    reason = `not reached (${body.status || 'unknown'})`;
  } else if (schemaErrors.length) {
    state = 'review';
    reason = `result did not match the schema: ${schemaErrors.join('; ')}`;
  } else if (cfg.reviewOutcomes.includes(outcome)) {
    state = 'review';
    reason = `outcome "${outcome}" always needs a human`;
  } else if (score !== null && score < cfg.reviewBelowConfidence) {
    state = 'review';
    reason = `confidence ${score} below ${cfg.reviewBelowConfidence}`;
  } else {
    state = 'done';
    reason = '';
  }

  return {
    state,
    reason,
    structured,
    confidence: score,
    confidenceLabel: confidence.label || '',
    evidence: Array.isArray(body.evidence) ? body.evidence.join(' | ') : ''
  };
}

/** Only the last four digits ever leave the server. */
function maskPhone(phone) {
  const p = str(phone);
  if (p.length < 5) return p;
  return '•••• ' + p.slice(-4);
}

module.exports = {
  REGIONS, STATES, TERMINAL_STATES, DEFAULT_CONFIG,
  validate, eligibility, buildPayload, classify,
  validateAgainstSchema, isTerminal, interpolate, maskPhone, str
};
