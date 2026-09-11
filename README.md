GitHub pe is file ka naam aur jagah: **`README.md`**

Neeche wale block ko pura copy karke GitHub ke editor mein paste karo. Block ke upar copy ka button ho to wahi use karna. Haath se select kar rahe ho to teen backtick wali pehli aur aakhri line **mat** lena.

```markdown
# SheetCall

**A workflow runtime for phone tasks, running on CALL-E.**
Rows in, real calls out, structured answers back.

SheetCall is not a dialer and not a chatbot. It is a small state machine that
decides *whether a phone call should happen at all*, places it through CALL-E
when the answer is yes, and turns what the call produced back into a row your
list can act on.

---

## Current implementation: Web adapter

**Storage adapter in this deployment: the browser (an in-page record list,
persisted to `localStorage`).**
**Call-state adapter: the CALL-E Calls API, which is authoritative.**

That sentence is deliberately at the top, because the whole point of the
architecture below is that this line is the *only* thing that changes when
SheetCall moves to a different host. A Google Sheets adapter, a Postgres
adapter and a KV adapter are all the same swap, and none of them touch the
runtime.

### Why the web adapter, and not Google Sheets

SheetCall was first built as a Google Sheets Apps Script plugin. That version
is complete and syntax-checked. It was retired as the *shipping* target for one
non-negotiable reason: the Apps Script editor is not usable on an Android
phone, and this project is built end-to-end on an Android phone. Two secondary
constraints compounded it — `onOpen()` custom menus never fire in the Sheets
Android app, and `SpreadsheetApp.getUi()` is unavailable in web-app context, so
the menu surface that made the Sheets version worth having did not exist on the
device the operator actually holds.

The Sheets adapter is therefore documented as the **second** adapter, not the
abandoned one. The runtime it ran on is the file that shipped here unchanged.

---

## Adapter architecture

```
         ┌──────────────────────────────────────────────────────┐
         │  SURFACES                                            │
         │                                                      │
         │   index.html          api/webhook.js                 │
         │   (operator console)  (CALL-E notification receiver) │
         └───────────────┬──────────────────┬───────────────────┘
                         │                  │
                         ▼                  ▼
         ┌──────────────────────────────────────────────────────┐
         │  RUNTIME  —  runtime.js                              │
         │                                                      │
         │   validate()      eligibility()    buildPayload()    │
         │   classify()      maskPhone()      isTerminal()      │
         │                                                      │
         │   Knows the state machine. Knows nothing about       │
         │   where records are stored or how they are shown.    │
         │   Pure functions, no I/O, unit-testable offline.     │
         └───────────────┬──────────────────┬───────────────────┘
                         │                  │
            ┌────────────┘                  └───────────┐
            ▼                                           ▼
  ┌───────────────────────┐              ┌──────────────────────────┐
  │  STORAGE ADAPTER      │              │  CALL ADAPTER            │
  │                       │              │                          │
  │  current: browser     │              │  calle.js                │
  │           list        │              │  POST /v1/calls          │
  │  next:    Sheets      │              │  GET  /v1/calls/{id}     │
  │           KV / SQL    │              │                          │
  │                       │              │  Holds the API key.      │
  │  Holds records.       │              │  Server-side only.       │
  └───────────────────────┘              └──────────────────────────┘
```

The rule the diagram encodes: **the runtime never imports an adapter, and an
adapter never imports another adapter.** Everything flows downward. When the
Apps Script host died, `runtime.js` ported across with zero edits and every
unit assertion still passed. That is the test of whether the boundary is real,
and it passed.

---

## Source adapters

A list has to come from somewhere, and in real work it is never one somewhere.
`sources.js` is the input half of the same boundary the server uses: it decides
how rows arrive, and knows nothing about what happens to them afterwards.

| Source | How it reads | Where the data goes |
|---|---|---|
| Paste CSV | typed or pasted text | never leaves the browser |
| Excel / CSV file | `.xlsx`, `.xls`, `.csv`, parsed in the browser with SheetJS | never leaves the browser |
| Google Sheets link | one server-side CSV export fetch (`api/sheet.js`) | the sheet's rows, once |
| Paste JSON | an array of objects, or `{ records: [...] }` | never leaves the browser |
| Airtable | browser talks to the Airtable REST API directly | the token stays in the tab |

All five end at the same `normaliseRows()`, so a record from Airtable and a
record typed by hand are indistinguishable by the time the state machine sees
them. Adding a sixth source means adding one function to `sources.js` and
changing nothing else — not the runtime, not the API, not the console.

### Column names are met where they are

Real lists say `Mobile No`, `Customer Name`, `Invoice #`, `Due Date`. Asking an
operator to rename columns before their first call is a good way to never get a
first call, so SheetCall matches the spellings people actually use and keeps any
column it does not recognise, which means extra columns stay available to the
call template. A phone number is stripped of spaces, dashes and brackets and
otherwise left exactly as written: if it is not valid E.164 the runtime blocks
the row and says so, which is more honest than guessing a country code.

### Two things this deliberately does not do

**It does not ask for your Google account.** The Google Sheets source reads a
link-shared sheet through a single server-side CSV fetch. There is no OAuth
flow, no Google token anywhere in this project, and no access to anything but
the one sheet whose link you pasted.

**It does not take custody of your Airtable token.** The browser talks to
Airtable directly. The token is never sent to SheetCall's server, never written
to storage, and is gone when the tab closes.

`api/sheet.js` is the one endpoint that fetches a URL on a caller's behalf,
which makes it the one place SSRF could live. It is fenced: only
`docs.google.com` is ever contacted, the caller never supplies the fetched URL
(it supplies a sheet link, from which the handler extracts an id and builds the
export URL itself), redirects are not followed, and the body is returned as text
and never parsed or acted on server-side.

---

## The state machine

Every feature in SheetCall is a transition in this machine. Nothing is a
standalone button.

```
                      ┌─────────┐
                      │ (empty) │
                      └────┬────┘
                           │ validate()
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────────┐  │
        │ blocked │  │waiting_window│  │  eligibility()
        └─────────┘  └──────┬───────┘  │
                            │          │
                    window opens       │
                            └────►┌─────────┐
                                  │ calling │
                                  └────┬────┘
                                       │ classify()
              ┌──────────┬─────────────┼──────────┬─────────┐
              ▼          ▼             ▼          ▼         ▼
          ┌──────┐  ┌────────┐  ┌───────────┐ ┌───────┐
          │ done │  │ review │  │ no_answer │ │ error │
          └──────┘  └────────┘  └─────┬─────┘ └───────┘
                                      │ requeue
                                      └──────► waiting_window
```

`blocked` and `waiting_window` are the states that matter most, and they are
the reason this is a runtime and not a dialer. The majority of rows a real
operator selects should never become a call. A row with a malformed number, a
row whose recipient is on do-not-call, a row that appears twice in the same
selection, a row whose locale CALL-E cannot speak, a row where it is 21:40 in
the recipient's own timezone — every one of those stops *before* the network,
with a reason a human can read.

### Feature → transition

| Feature | Transition it implements | Where |
|---|---|---|
| E.164 phone validation | `(empty) → blocked` | `runtime.validate` |
| Do-not-call consent flag | `(empty) → blocked` | `runtime.validate` |
| Duplicate-number guard (per run) | `(empty) → blocked` | `api/call.js` + `runtime.validate` |
| Locale availability check | `(empty) → blocked` | `runtime.validate` |
| Attempt cap | `(empty) → blocked` | `api/call.js` |
| Per-region calling window | `(empty) → waiting_window` | `runtime.eligibility` |
| Per-region working days | `(empty) → waiting_window` | `runtime.eligibility` |
| Per-run call cap | request refused | `api/call.js` |
| Idempotency key | `waiting_window → calling` (exactly once) | `api/call.js` |
| Structured-result schema | `calling → done` \| `review` | `runtime.validateAgainstSchema` |
| Confidence threshold | `calling → done` \| `review` | `runtime.classify` |
| Evidence capture | payload of `done` / `review` | `runtime.classify` |
| No-answer requeue | `no_answer → waiting_window` | `runtime.classify` + console |
| Phone masking | applies to every state leaving the server | `runtime.maskPhone` |
| Dry run | whole machine, zero network | `api/call.js` |

---

## Localization intelligence

`regions.js` carries all 42 countries CALL-E supports, generated
programmatically from the official country table rather than transcribed, so
there is no transcription error to find.

Each entry separates two different kinds of knowledge, and the file says which
is which:

- **Facts** — `languages` and `line`. These come from CALL-E and are not
  editable guesses. Canada is English-only on CALL-E; it is *not* English and
  French, and SheetCall will refuse `fr-CA` rather than quietly substituting
  `en-CA`. Seven countries (AE, AU, BR, MX, MY, SG, US) have **Local** lines.
  The other 35 are **International**, which CALL-E's own documentation
  describes as primarily intended for testing — so the console badges those
  rows instead of pretending the call quality is equivalent.
- **Editable defaults** — `timezone`, `work_days`, `call_window_local`. These
  are conventions this app chose, not facts about any recipient. The working
  week is Sunday–Thursday for AE, IL, OM and SA, and Monday–Friday elsewhere.

The locale check **fails closed**. If a record asks for a language CALL-E does
not offer in that country, the row is blocked with the reason spelled out
(`CALL-E supports English for CA — locale fr-CA is not available`). It does not
fall back, because a silent fallback is how someone gets a call in a language
they don't speak.

---

## Security

### The API key

The CALL-E API key lives in exactly one place: the `CALLE_API_KEY` environment
variable on the server. `calle.js` is the only file that reads it. It is
never sent to the browser, never written to a record, and never appears in any
response body. `/api/config` reports a `keyConfigured` boolean and nothing
else — the console can tell you the key is missing without ever being able to
tell you what it is.

### The webhook trust boundary

**CALL-E's completion notification is unsigned.** CALL-E's own reference
receiver states that matching header and body event ids are "only a consistency
check, not authentication", and that the authenticated `calls.get` re-fetch is
the trust boundary. A public endpoint is reachable by anyone who learns the URL.

So `api/webhook.js` trusts **exactly one field** from the request body — the
call id — and then re-fetches that call from the authenticated Calls API.
Everything it reports comes from that authenticated response. No result, no
status, no transcript and no confidence score is ever read out of the request
body.

The worst a forged POST achieves is making the server re-read a call the
account already owns. A call id that does not resolve returns a deliberately
vague `not verifiable`, so a forged id cannot be used as an oracle to enumerate
what the account does and does not own.

### Server-side enforcement

The entire state machine runs in `api/call.js`, on the server. The browser
sends records; it does not send verdicts. A tampered client cannot skip
validation, cannot skip the calling-window guard, cannot skip the duplicate
check and cannot raise the per-run cap.

### Phone masking

`runtime.maskPhone` reduces a number to its last four digits anywhere it leaves
the server — console, detail view, webhook response. The full number goes to
CALL-E and nowhere else.

---

## When *not* to call

This is the section most call-automation projects don't write, and it is the
one that makes SheetCall defensible rather than merely impressive.

SheetCall will not place a call when:

- the number is not valid E.164
- the recipient has a do-not-call / consent-withheld flag
- the same number appears more than once in the selection
- the requested language is not one CALL-E offers for that country
- it is outside the recipient's local calling window, or not a working day
  where they are
- the row has already been attempted `maxAttempts` times
- the selection exceeds `maxCallsPerRun`

And SheetCall will not mark a call `done` when:

- `completion_confidence.score` is below the configured threshold
- the returned `structured_result` fails its declared schema
- an enum field comes back with a value outside its allowed set

Those go to `review`, in front of a human, with the evidence attached.

### Jurisdiction

Automated calling is regulated, and the regulation is not uniform. In India,
TRAI's TCCCPR-2018 requires Principal Entity registration, registered headers
and content templates, and explicit consent for commercial calls; the February
2025 amendment addresses AI-driven telemarketing specifically, and
telemarketing from a personal number carries disconnection and a two-year
blacklist. SheetCall does not and cannot grant compliance. What it provides is
the consent flag, the attempt cap, the calling window, the evidence trail and
the masked log that a compliant operation needs in order to demonstrate what it
did. The operator is still the accountable party.

---

## Layout

```
index.html            operator console
sources.js            source adapters — CSV, Excel, Sheets, JSON, Airtable
package.json          no server dependencies; Node >= 18 for global fetch
regions.js              42 CALL-E countries — facts vs editable defaults
runtime.js              the state machine — pure, no I/O, portable
calle.js                  CALL-E API client — the only reader of the key
api/config.js         regions + states + defaults + keyConfigured
api/call.js           runs the machine server-side, places calls
api/status.js         polls up to 25 calls, returns classified verdicts
api/webhook.js        unsigned notification → authenticated re-fetch
api/sheet.js          Google Sheets CSV reader, host-allowlisted
```

---

## Setup

1. Deploy the folder. There is no build step and there are no dependencies.
2. Set `CALLE_API_KEY` in the host's environment-variable settings. Do not put
   it in a file and do not paste it into a chat.
3. If the host enables deployment protection by default, turn it off — the
   webhook receiver must be publicly reachable for CALL-E to POST to it.
4. Point CALL-E's notification URL at `https://<your-host>/api/webhook`.
5. Open the site. The header reports whether the key is configured. Use
   **Load example list** and **Dry run** to exercise every state without
   placing a single call or spending a single credit.

---

## Known limits, stated plainly

- **The webhook does not persist.** It verifies, classifies and returns, but
  this deployment has no store to write into, so polling via `/api/status` is
  the result path the operator actually sees. Attaching a KV store is the
  documented next step, and the handler is already shaped for it — the trust
  boundary is the hard part and it is done.
- **Records live in the browser.** `localStorage` is per-device. Two people
  cannot share a list. That is the storage adapter's limitation, not the
  runtime's, which is exactly the point of the boundary.
- **Duplicate detection is per-run.** It catches the same number twice in one
  selection; it does not know about a call placed yesterday.
- **CALL-E's Calls API is authoritative for call state.** SheetCall keeps no
  competing call database on purpose. When the two could disagree, there is
  only one of them.

## License

MIT.
```
