/**
 * CALL-E API client.
 *
 * The API key lives only in the CALLE_API_KEY environment variable on the
 * server. It is never sent to the browser and never appears in a response.
 */

const BASE_URL = process.env.CALLE_BASE_URL || 'https://api.heycall-e.com';

function hasKey() {
  return Boolean(process.env.CALLE_API_KEY);
}

async function calleFetch(method, path, { body, idempotencyKey } = {}) {
  if (!hasKey()) {
    return { ok: false, error: 'CALLE_API_KEY is not set on the server' };
  }

  const headers = {
    Authorization: `Bearer ${process.env.CALLE_API_KEY}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 200)}` };
    }
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch (err) {
      return { ok: false, error: 'CALL-E returned a non-JSON response' };
    }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

const createCall = (payload, idempotencyKey) =>
  calleFetch('POST', '/v1/calls', { body: payload, idempotencyKey });

const getCall = (callId) =>
  calleFetch('GET', `/v1/calls/${encodeURIComponent(callId)}`);

module.exports = { hasKey, calleFetch, createCall, getCall, BASE_URL };
