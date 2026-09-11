/**
 * SheetCall source adapters.
 *
 * This is the input half of the adapter architecture. `runtime.js` decides what
 * should happen to a record; this file decides how a record gets here in the
 * first place. Neither knows about the other, and neither changes when the
 * other gains a new case — which is the whole claim SheetCall makes about being
 * host-agnostic, made checkable in code.
 *
 * Five sources, one output shape:
 *
 *   paste CSV        text          → rows
 *   Excel / CSV file  .xlsx .xls .csv → rows   (parsed in the browser, SheetJS)
 *   Google Sheets    share link    → rows   (server proxies one CSV export)
 *   JSON            text          → rows
 *   Airtable        base + table  → rows   (browser → Airtable, token stays here)
 *
 * Every one of them ends at normaliseRows(), so a record from Airtable and a
 * record typed by hand are indistinguishable by the time the state machine sees
 * them. Adding a sixth source means adding a function here and nothing else.
 *
 * The console works without this file — it falls back to paste-CSV only.
 */

(function () {
  'use strict';

  var app = window.SheetCall;
  if (!app || !app.addRecords) return;

  var esc = app.esc;
  var openSheet = app.openSheet;
  var closeSheet = app.closeSheet;

  // ---- column mapping ----------------------------------------------------
  //
  // Real lists never use our column names. Rather than make the operator rename
  // headers, accept the spellings people actually use. Anything unrecognised is
  // kept as-is, so extra columns survive into the call template.

  var ALIASES = {
    id:            ['id', 'rowid', 'recordid', 'sno', 'srno'],
    name:          ['name', 'fullname', 'contact', 'contactname', 'customer',
                    'customername', 'person', 'client', 'debtor'],
    phone_e164:    ['phonee164', 'phone', 'mobile', 'mobileno', 'number',
                    'phonenumber', 'contactnumber', 'tel', 'telephone', 'whatsapp'],
    region:        ['region', 'country', 'countrycode', 'iso', 'iso2'],
    locale:        ['locale', 'language', 'lang'],
    timezone:      ['timezone', 'tz', 'timezoneid'],
    do_not_call:   ['donotcall', 'dnc', 'optout', 'unsubscribed', 'blocked'],
    invoice_ref:   ['invoiceref', 'invoice', 'invoiceno', 'invoicenumber',
                    'ref', 'reference', 'billno'],
    amount:        ['amount', 'total', 'dueamount', 'outstanding', 'balance', 'value'],
    due_date:      ['duedate', 'due', 'deadline', 'date', 'paymentdate'],
    from_business: ['frombusiness', 'business', 'company', 'from', 'sender', 'org']
  };

  var LOOKUP = (function () {
    var m = {};
    Object.keys(ALIASES).forEach(function (canonical) {
      ALIASES[canonical].forEach(function (a) { m[a] = canonical; });
      m[canonical.replace(/[^a-z0-9]/g, '')] = canonical;
    });
    return m;
  })();

  function slug(h) {
    return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function cleanPhone(v) {
    // Spaces, dashes and brackets are formatting, not digits. Everything else
    // is left exactly as written — if it is not E.164 the runtime blocks it and
    // says so, which is more honest than guessing a country code.
    return String(v == null ? '' : v).replace(/[\s()\-.]/g, '').trim();
  }

  function normaliseRows(rawRows, sourceLabel) {
    var out = [];
    rawRows.forEach(function (raw, i) {
      if (!raw || typeof raw !== 'object') return;
      var rec = {};
      Object.keys(raw).forEach(function (key) {
        var canonical = LOOKUP[slug(key)] || key;
        var val = raw[key];
        rec[canonical] = (val == null) ? '' : String(val).trim();
      });
      if (!Object.keys(rec).some(function (k) { return rec[k] !== ''; })) return;

      if (rec.phone_e164) rec.phone_e164 = cleanPhone(rec.phone_e164);
      if (rec.region) rec.region = rec.region.toUpperCase().slice(0, 2);
      if (!rec.id) rec.id = 'src-' + Date.now().toString(36) + '-' + i;
      rec.attempt = Number(rec.attempt || 0);
      rec.source_kind = sourceLabel;
      out.push(rec);
    });
    return out;
  }

  function parseCsvText(text) {
    // Deliberately small: quoted fields containing commas and doubled quotes,
    // which is what a spreadsheet export actually produces. Anything stranger
    // belongs in a real file, and the file source handles those with SheetJS.
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var s = String(text || '').replace(/\r\n?/g, '\n');

    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    rows = rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    if (rows.length < 2) return [];

    var head = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, i) { if (h) o[h] = r[i] === undefined ? '' : r[i]; });
      return o;
    });
  }

  function finish(rows, label) {
    var recs = normaliseRows(rows, label);
    if (!recs.length) {
      alert('No usable rows found. Check that the first row is a header and that there is at least one row under it.');
      return;
    }
    var missing = recs.filter(function (r) { return !r.phone_e164; }).length;
    app.addRecords(recs);
    closeSheet();
    if (missing) {
      alert(recs.length + ' rows loaded. ' + missing +
            ' have no phone column that SheetCall recognised — those will show as Blocked with the reason.');
    }
  }

  // ---- the picker ---------------------------------------------------------

  var MENU = [
    { k: 'paste',    t: 'Paste CSV',          d: 'Copy rows out of any spreadsheet and paste them here.' },
    { k: 'file',     t: 'Excel or CSV file',  d: 'Pick an .xlsx, .xls or .csv file. Parsed in your browser.' },
    { k: 'gsheets',  t: 'Google Sheets link', d: 'Paste a share link. The sheet must be viewable by anyone with the link.' },
    { k: 'json',     t: 'Paste JSON',         d: 'An array of objects, from an API or another tool.' },
    { k: 'airtable', t: 'Airtable',           d: 'Read a table straight from a base. Your token stays in this tab.' }
  ];

  function openPicker() {
    var h = '<h3>Add records</h3>' +
      '<div class="note">Where the rows come from does not change what happens to them. ' +
      'Every source below ends up in the same state machine.</div>' +
      '<div style="margin-top:12px">';
    MENU.forEach(function (m) {
      h += '<div class="contact" data-src="' + m.k + '" style="margin-top:10px">' +
             '<div class="name">' + esc(m.t) + '</div>' +
             '<div class="small" style="margin-top:4px">' + esc(m.d) + '</div>' +
           '</div>';
    });
    h += '</div><div class="btns"><button class="btn" data-close="1">Cancel</button></div>';
    openSheet(h);
  }

  // ---- individual sources -------------------------------------------------

  function panelPaste() {
    openSheet(
      '<h3>Paste CSV</h3>' +
      '<div class="note">First row must be the header. SheetCall recognises common column names — ' +
      'phone, mobile, number, country, customer, invoice, amount, due date — so you rarely need to rename anything.</div>' +
      '<div style="margin-top:12px"><textarea id="sc-csv" placeholder="name,phone,country,invoice,amount,due date"></textarea></div>' +
      '<div class="btns"><button class="btn" data-back="1">Back</button>' +
      '<button class="btn primary" id="sc-csv-go">Load rows</button></div>'
    );
    document.getElementById('sc-csv-go').onclick = function () {
      finish(parseCsvText(document.getElementById('sc-csv').value), 'csv-paste');
    };
  }

  function panelFile() {
    openSheet(
      '<h3>Excel or CSV file</h3>' +
      '<div class="note">The file is read inside your browser. It is never uploaded to SheetCall, ' +
      'and the numbers in it never leave this tab except as the calls you approve.</div>' +
      '<div style="margin-top:14px"><input type="file" id="sc-file" accept=".xlsx,.xls,.csv,.tsv" ' +
      'style="width:100%;padding:12px;background:var(--sunk);border:1px solid var(--line);border-radius:12px;color:var(--ink)"></div>' +
      '<div class="note" id="sc-file-note" style="margin-top:10px"></div>' +
      '<div class="btns"><button class="btn" data-back="1">Back</button></div>'
    );
    var note = document.getElementById('sc-file-note');
    document.getElementById('sc-file').onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      note.textContent = 'Reading ' + file.name + '…';

      if (/\.(csv|tsv)$/i.test(file.name)) {
        var fr = new FileReader();
        fr.onload = function () { finish(parseCsvText(fr.result), 'csv-file'); };
        fr.onerror = function () { note.textContent = 'Could not read that file.'; };
        fr.readAsText(file);
        return;
      }

      if (typeof XLSX === 'undefined') {
        note.textContent = 'The spreadsheet reader did not load. Check your connection and reopen this panel.';
        return;
      }
      var r = new FileReader();
      r.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(r.result), { type: 'array' });
          var first = wb.SheetNames[0];
          if (!first) { note.textContent = 'That workbook has no sheets.'; return; }
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '', raw: false });
          finish(rows, 'excel');
        } catch (err) {
          note.textContent = 'Could not read that workbook: ' + err.message;
        }
      };
      r.onerror = function () { note.textContent = 'Could not read that file.'; };
      r.readAsArrayBuffer(file);
    };
  }

  function panelSheets() {
    openSheet(
      '<h3>Google Sheets link</h3>' +
      '<div class="note">In Google Sheets: <b>Share → General access → Anyone with the link → Viewer</b>, ' +
      'then paste the link here. SheetCall reads the rows once. It never asks for access to your Google ' +
      'account and holds no Google token.</div>' +
      '<div style="margin-top:12px"><textarea id="sc-gs" style="height:80px" ' +
      'placeholder="https://docs.google.com/spreadsheets/d/..."></textarea></div>' +
      '<div class="note" id="sc-gs-note" style="margin-top:6px"></div>' +
      '<div class="btns"><button class="btn" data-back="1">Back</button>' +
      '<button class="btn primary" id="sc-gs-go">Read sheet</button></div>'
    );
    var note = document.getElementById('sc-gs-note');
    document.getElementById('sc-gs-go').onclick = function () {
      var url = document.getElementById('sc-gs').value.trim();
      if (!url) return;
      note.textContent = 'Reading…';
      fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      })
        .then(function (r) { return r.json(); })
        .then(function (out) {
          if (out.error) { note.textContent = out.error; return; }
          finish(parseCsvText(out.csv), 'google-sheets');
        })
        .catch(function (err) { note.textContent = 'Request failed: ' + err.message; });
    };
  }

  function panelJson() {
    openSheet(
      '<h3>Paste JSON</h3>' +
      '<div class="note">An array of objects, or an object with a <code>records</code> array. ' +
      'Keys are matched to SheetCall columns the same way CSV headers are.</div>' +
      '<div style="margin-top:12px"><textarea id="sc-json" ' +
      'placeholder=\'[{"name":"Dana Reyes","phone":"+15550100001","country":"US"}]\'></textarea></div>' +
      '<div class="note" id="sc-json-note" style="margin-top:6px"></div>' +
      '<div class="btns"><button class="btn" data-back="1">Back</button>' +
      '<button class="btn primary" id="sc-json-go">Load rows</button></div>'
    );
    var note = document.getElementById('sc-json-note');
    document.getElementById('sc-json-go').onclick = function () {
      var raw = document.getElementById('sc-json').value;
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (err) { note.textContent = 'That is not valid JSON: ' + err.message; return; }
      var rows = Array.isArray(parsed) ? parsed
               : (parsed && Array.isArray(parsed.records)) ? parsed.records
               : null;
      if (!rows) { note.textContent = 'Expected an array of objects, or { "records": [ ... ] }.'; return; }
      finish(rows, 'json');
    };
  }

  function panelAirtable() {
    openSheet(
      '<h3>Airtable</h3>' +
      '<div class="note">Your Airtable token is used by this browser tab to talk to Airtable directly. ' +
      'It is <b>never sent to SheetCall\'s server</b>, never written to storage, and is gone when you ' +
      'close the tab. Use a read-only personal access token scoped to one base.</div>' +
      '<div style="margin-top:12px">' +
        '<textarea id="sc-at-base" style="height:44px" placeholder="Base ID — app..."></textarea>' +
        '<textarea id="sc-at-table" style="height:44px;margin-top:8px" placeholder="Table name — e.g. Receivables"></textarea>' +
        '<textarea id="sc-at-key" style="height:44px;margin-top:8px" placeholder="Personal access token — pat..."></textarea>' +
      '</div>' +
      '<div class="note" id="sc-at-note" style="margin-top:6px"></div>' +
      '<div class="btns"><button class="btn" data-back="1">Back</button>' +
      '<button class="btn primary" id="sc-at-go">Read table</button></div>'
    );
    var note = document.getElementById('sc-at-note');
    document.getElementById('sc-at-go').onclick = function () {
      var base = document.getElementById('sc-at-base').value.trim();
      var table = document.getElementById('sc-at-table').value.trim();
      var key = document.getElementById('sc-at-key').value.trim();
      if (!base || !table || !key) { note.textContent = 'All three fields are needed.'; return; }
      note.textContent = 'Reading…';

      fetch('https://api.airtable.com/v0/' + encodeURIComponent(base) + '/' +
            encodeURIComponent(table) + '?maxRecords=100', {
        headers: { Authorization: 'Bearer ' + key }
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Airtable returned HTTP ' + r.status);
          return r.json();
        })
        .then(function (out) {
          var rows = (out.records || []).map(function (rec) {
            var f = rec.fields || {};
            if (!f.id) f.id = rec.id;
            return f;
          });
          finish(rows, 'airtable');
        })
        .catch(function (err) {
          note.textContent = 'Could not read that table: ' + err.message +
            '. Check the base id, the exact table name, and that the token can read this base.';
        });
    };
  }

  var PANELS = {
    paste: panelPaste, file: panelFile, gsheets: panelSheets,
    json: panelJson, airtable: panelAirtable
  };

  // ---- wiring -------------------------------------------------------------

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;

    var back = t.closest('[data-back]');
    if (back) { openPicker(); return; }

    var close = t.closest('[data-close]');
    if (close) { closeSheet(); return; }

    var pick = t.closest('[data-src]');
    if (pick && PANELS[pick.dataset.src]) { PANELS[pick.dataset.src](); return; }
  });

  // The console's own CSV buttons become the multi-source entry point.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#bCsv, #bCsv2');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openPicker();
  }, true);

  // Relabel them once the console has rendered, and again after re-renders.
  function relabel() {
    ['bCsv', 'bCsv2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.textContent !== 'Add records') el.textContent = 'Add records';
    });
  }
  relabel();
  new MutationObserver(relabel).observe(document.body, { childList: true, subtree: true });
})();
