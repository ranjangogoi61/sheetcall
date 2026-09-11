/**
 * CALL-E webhook receiver.
 *
 * The notification is UNSIGNED. CALL-E's own reference receiver states that
 * matching header and body event ids are "only a consistency check, not
 * authentication", and that the authenticated `calls.get` re-fetch is the trust
 * boundary. A public endpoint is reachable by anyone who learns the URL.
 *
 * So this handler trusts exactly ONE field from the request — the call id — and
 * then re-fetches that call from the authenticated Calls API. Everything it
 * reports comes from that authenticated response. Nothing in the request body
 * is ever treated as a result. The worst a forged POST achieves is making the
 * server re-read a call the account already owns.
 */

const runtime = require('../runtime');
const { getCall } = require('../calle');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'ignored', note: 'POST only' });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (err) {
    return res.status(200).json({ status: 'ignored', note: 'unparseable body' });
  }

  // The payload shape is not fully documented, so accept the usual spellings.
  // Nothing else from the body is read.
  const callId = runtime.str(
    payload.call_id || payload.id ||
    (payload.data && (payload.data.call_id || payload.data.id))
  );
  if (!callId) {
    return res.status(200).json({ status: 'ignored', note: 'no call id in payload' });
  }

  const call = await getCall(callId);
  if (!call.ok) {
    // Deliberately vague: a forged id must not become an account oracle.
    return res.status(200).json({ status: 'ignored', note: 'not verifiable' });
  }
  if (!runtime.isTerminal(call.body.status)) {
    return res.status(200).json({ status: 'deferred', note: 'call not terminal yet' });
  }

  const verdict = runtime.classify(call.body);

  // This deployment keeps no database, so there is nothing to persist into.
  // Polling is the result path the operator sees. The endpoint exists to prove
  // the trust boundary and to be the hook a store would attach to; wiring it to
  // a KV store is the documented next step.
  return res.status(200).json({
    status: 'accepted',
    callId,
    verified: true,
    state: verdict.state,
    reason: verdict.reason,
    confidence: verdict.confidence,
    persisted: false,
    note: 'Verified by authenticated re-fetch. No store attached in this deployment.'
  });
};
