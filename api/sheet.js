/**
 * Google Sheets reader.
 *
 * A browser cannot fetch a Google Sheets CSV export directly — Google sends no
 * CORS headers for it — so this endpoint performs that one fetch server-side.
 *
 * An endpoint that fetches a URL on a caller's behalf is an SSRF hole unless it
 * is fenced, so this one is fenced three ways:
 *
 *   1. The host is allowlisted. Only docs.google.com is ever contacted. The
 *      caller does not supply the URL that gets fetched — it supplies a sheet
 *      link, from which this handler extracts an id and then *builds* the
 *      export URL itself. A caller cannot express a request to anywhere else.
 *   2. Redirects are not followed.
 *   3. The response is returned as text and never parsed, executed or acted on
 *      here. Parsing happens in the browser, where it cannot reach the API key.
 *
 * The sheet must be shared so that anyone with the link can view it. Nothing in
 * SheetCall asks for Google account access, and no Google token exists anywhere
 * in this project.
 */

const ALLOWED_HOST = 'docs.google.com';
const MAX_BYTES = 2 * 1024 * 1024;

function buildExportUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch (err) {
    return { error: 'That is not a valid URL' };
  }
  if (u.protocol !== 'https:') {
    return { error: 'Only https links are accepted' };
  }
  if (u.hostname !== ALLOWED_HOST) {
    return { error: `Only ${ALLOWED_HOST} links are accepted` };
  }

  const id = u.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9\-_]+)/);
  if (!id) {
    return { error: 'That does not look like a Google Sheets link' };
  }

  // gid can arrive as #gid=0 or ?gid=0; default to the first tab.
  const fromHash = (u.hash || '').match(/gid=(\d+)/);
  const gid = fromHash ? fromHash[1] : (u.searchParams.get('gid') || '0');

  return {
    url: `https://${ALLOWED_HOST}/spreadsheets/d/${id[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const built = buildExportUrl(body.url);
  if (built.error) {
    return res.status(400).json({ error: built.error });
  }

  let upstream;
  try {
    upstream = await fetch(built.url, { redirect: 'manual' });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Google Sheets' });
  }

  // A redirect here means Google wants a sign-in, which means the sheet is not
  // link-shared. Say that plainly rather than chasing the redirect.
  if (upstream.status >= 300 && upstream.status < 400) {
    return res.status(400).json({
      error: 'That sheet is not shared. In Google Sheets: Share → General access → Anyone with the link → Viewer.'
    });
  }
  if (!upstream.ok) {
    return res.status(400).json({ error: `Google Sheets returned HTTP ${upstream.status}` });
  }

  const text = await upstream.text();

  if (text.length > MAX_BYTES) {
    return res.status(400).json({ error: 'That sheet is too large to load in one go' });
  }
  // A sign-in page comes back as HTML with a 200, so check the shape too.
  if (/^\s*<(!doctype|html)/i.test(text)) {
    return res.status(400).json({
      error: 'That sheet is not shared publicly — Google returned a sign-in page instead of the rows.'
    });
  }

  res.status(200).json({ csv: text, bytes: text.length });
};
