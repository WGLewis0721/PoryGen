# Waitlist API

`POST /api/waitlist` collects beta-tester/interest signups. Each new signup (name and email) is appended as a row in a Google Sheet; the form then emails an alert to **graymattertechllc@gmail.com** through FormSubmit (see *Email alerts*). It is separate from the scanner and never gates `/scan`: the waitlist is for people who want to hear about the beta, not a signup wall.

Implementation: `api/waitlist.mjs` (wiring), `api/_lib/waitlist.mjs` (validation, abuse controls), `api/_lib/google-sheets.mjs` (service-account Sheets client, no SDK), `api/_lib/formsubmit.mjs` (email alert). Tests: `npm run test:waitlist`.

## Frontend contract

Same-origin `fetch` from the PoryGen app. No auth, no CORS setup needed.

```ts
const response = await fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada Lovelace',     // optional, shown as a required field in the form
    email: 'ada@example.com', // required
    website: '',              // honeypot: render as a hidden input and leave empty
  }),
});
const result = await response.json();
```

| Field | Type | Rule |
|---|---|---|
| `name` | string | ≤100 chars; trimmed, single line. |
| `email` | string | Required. Trimmed and lowercased. ≤254 chars. |
| `website` | string | Honeypot. Hide it from people (`position:absolute; left:-9999px`, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), not with `type="hidden"`. |

**Only name and email are collected.** Any other field a form sends (`product`, `source`, `consent`, …) is ignored and never stored, except that `consent: false` is refused. Submitting the form is the opt-in, so put a line under the button such as “We'll email you about the PoryGen beta. Unsubscribe anytime.”

### Responses

Success, including an email that is already on the list (deliberately identical so the endpoint can't be used to look people up):

```json
200 { "ok": true, "status": "joined" }
```

Errors share the scanner's shape — `{ error, code, retryable, field? }`. `error` is safe to show to the user; `field` tells the form which input to highlight.

| Status | `code` | `field` | Retryable | Meaning |
|---|---|---|---|---|
| 400 | `EMAIL_REQUIRED` | `email` | no | No email. |
| 400 | `INVALID_EMAIL` | `email` | no | Not a plausible email address. |
| 400 | `CONSENT_REQUIRED` | `consent` | no | The form sent `consent: false`. |
| 400 | `INVALID_FIELD` | `name` | no | `name` isn't text. |
| 400 | `INVALID_JSON` / `INVALID_REQUEST` | — | no | Body isn't a JSON object. |
| 403 | `ORIGIN_NOT_ALLOWED` | — | no | Browser `Origin` is not this site or the allowlist. |
| 405 | `METHOD_NOT_ALLOWED` | — | no | Use POST. |
| 413 | `REQUEST_TOO_LARGE` | — | no | Body over 8 KB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | — | no | Send `application/json`. |
| 429 | `RATE_LIMITED` | — | yes | Too many attempts from one IP; honour `Retry-After` (seconds). |
| 502 | `WAITLIST_STORAGE_FAILED` | — | yes | Saving to the Google Sheet failed. |
| 503 | `WAITLIST_UNAVAILABLE` | — | yes | The Google Sheet isn't configured on this deployment. Success is never reported without a saved row. |
| 500 | `WAITLIST_FAILED` | — | yes | Unexpected error. |

Suggested UI: disable the button while the request is in flight; on `ok` show a thank-you state; on a `field` error mark that input; on `retryable` show the message with a retry action.

## Spreadsheet

Rows go to the spreadsheet's **first tab**, or the tab named by `WAITLIST_SHEET_TAB`. Row 1 must be this header, columns A–E:

```
submitted_at | email | name | consent_version | status
```

- `submitted_at` is ISO-8601 UTC.
- `consent_version` is `WAITLIST_CONSENT_VERSION` in `api/_lib/waitlist.mjs`. Bump it when the consent wording changes.
- `status` starts as `waitlisted`. Change it by hand (e.g. `invited`, `active`, `unsubscribed`) as you work through beta invites; the API never rewrites existing rows.
- Values are written with `valueInputOption=RAW`, and anything starting with `= + - @` gets a leading `'`, so submitted text can't run as a formula in Sheets or in a CSV/Excel export.
- Duplicate check: column B is read before each append (ignoring the formula-guard apostrophe), and same-email submissions take turns within a server instance, so double clicks store one row. Google Sheets has no unique constraint, so two server instances receiving the same new email at the same instant can still both append; rare and harmless.

## Email alerts

Each signup is also emailed to **graymattertechllc@gmail.com** through FormSubmit, the relay the Gray Matter site's contact form already uses. **The browser sends the alert, not the server:** FormSubmit's Cloudflare protection rejects requests from Vercel's servers (HTTP 403), while browser requests go through, exactly as on the Gray Matter site. After `/api/waitlist` answers `ok`, the form fires this and never waits on it:

```ts
if (result.ok) {
  fetch('https://formsubmit.co/ajax/graymattertechllc@gmail.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      _subject: `[PoryGen] New beta waitlist signup: ${email}`,
      _template: 'table',
      _captcha: 'false',
      _replyto: email, // replying from Gmail reaches the person
      product: 'PoryGen',
      name,
      email,
    }),
  }).catch(() => {}); // the signup is already saved; never block or fail the form on the alert
}
```

- The sheet is the record; the alert is a convenience. A blocked or failed alert loses nothing.
- **One-time activation:** FormSubmit holds the first message from a new site and emails an **Activate Form** link to the inbox. Click it once for `porygen.vercel.app`.
- The server-side alert (`api/_lib/formsubmit.mjs`) stays available but is switched off with `WAITLIST_NOTIFY_EMAIL=off` in the Vercel env vars.

## Setup (one time)

The service account `waitlist@waitlist-graymattertechllc.iam.gserviceaccount.com` is set up and the Vercel env vars are set; these steps are for reference or a rebuild.


1. **Google Cloud project** → APIs & Services → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → **Create service account** (no roles needed) → Keys → **Add key → JSON**. Keep the file private; don't commit it.
3. **Spreadsheet:** **PoryGen Beta Waitlist** already exists, with the header row, in *Gray Matter LLC › 03 - Sales & Clients › Beta Waitlists* (next to the Studigo, APEX, FundMatch and Spread sheets). One service account serves all five products.
4. **Share the *Beta Waitlists* folder** with the service account's `client_email` as **Editor**. Every sheet inside inherits access, and the service account can't see anything else in your Drive.
5. In **Vercel → Project → Settings → Environment Variables** (Production and Preview), set:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` from the JSON
   - `GOOGLE_PRIVATE_KEY` = `private_key` from the JSON (as-is, with its `\n` sequences)
   - `WAITLIST_SPREADSHEET_ID` = the ID between `/d/` and `/edit` in the sheet URL
   - `WAITLIST_NOTIFY_EMAIL=off` (the browser sends alerts); optional `WAITLIST_SHEET_TAB`, `WAITLIST_ALLOWED_ORIGINS` (comma-separated, e.g. `http://localhost:5173` for local dev against a deployed API)
6. Redeploy, then check:

```sh
curl -sS -X POST https://porygen.vercel.app/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","consent":true,"source":"setup-check"}'
```

Expect `{"ok":true,"status":"joined"}` and a new row. A `503 WAITLIST_UNAVAILABLE` means a Google env var is missing; a `502` usually means the sheet isn't shared with the service account, `WAITLIST_SHEET_TAB` names a tab that doesn't exist, or the Sheets API isn't enabled (the Vercel function log shows the Google HTTP status).

Local dev: `vite` doesn't serve `/api`. Run `vercel dev` with the env vars in `.env.local`, or point the form at a preview deployment and add the local origin to `WAITLIST_ALLOWED_ORIGINS`.

## Abuse controls

- Same-origin `Origin` check (plus allowlist); requests with no `Origin` (curl, server-side) are accepted, since they aren't browser CSRF.
- 8 KB body cap, JSON only, strict types; unknown fields are dropped.
- Honeypot `website` field: filled → fake success, nothing stored.
- In-memory rate limit of 10 attempts per IP per 10 minutes. This only counts within one warm function instance, so it's best-effort; for a durable limit add a **Vercel Firewall rate-limit rule** on `/api/waitlist`.
- Errors never echo Google responses or credentials to the client.

## Privacy

Unlike scan source, waitlist contact details **are deliberately stored** in the Google Sheet and emailed from the visitor's browser through FormSubmit to the Gray Matter Gmail inbox (Google and FormSubmit are subprocessors). No IP address, user agent or scan data goes into the row. Mention the waitlist in the planned Privacy Policy, and honour removal requests by deleting the row.
