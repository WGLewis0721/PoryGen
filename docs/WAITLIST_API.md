# Waitlist API

`POST /api/waitlist` collects beta-tester/interest signups. Each new signup is appended as a row in a Google Sheet and emailed as an alert to **graymattertechllc@gmail.com** through FormSubmit, the same relay the Gray Matter site's contact form uses. It is separate from the scanner and never gates `/scan`: the waitlist is for people who want to hear about the beta, not a signup wall.

Implementation: `api/waitlist.mjs` (wiring), `api/_lib/waitlist.mjs` (validation, abuse controls), `api/_lib/google-sheets.mjs` (service-account Sheets client, no SDK), `api/_lib/formsubmit.mjs` (email alert). Tests: `npm run test:waitlist`.

## Frontend contract

Same-origin `fetch` from the PoryGen app. No auth, no CORS setup needed.

```ts
const response = await fetch('/api/waitlist', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'ada@example.com',      // required
    consent: true,                 // required, must be literal true
    name: 'Ada Lovelace',          // optional
    company: 'Analytical Engines', // optional
    role: 'Engineer',              // optional, free text
    teamSize: '2-10',              // optional: "1" | "2-10" | "11-50" | "51-200" | "200+"
    useCase: 'Checking AI-assisted code before release', // optional
    source: 'landing',             // optional: where the form lives, e.g. landing | scan-results | utm_campaign
    website: '',                   // honeypot: render as a hidden input and leave empty
  }),
});
const result = await response.json();
```

| Field | Type | Rule |
|---|---|---|
| `email` | string | Required. Trimmed and lowercased. ≤254 chars. |
| `consent` | boolean | Required, must be `true`. Back it with an unticked checkbox, e.g. “Email me about the PoryGen beta. I can unsubscribe anytime.” |
| `name` | string | Optional, ≤100 chars. |
| `company` | string | Optional, ≤120 chars. |
| `role` | string | Optional, ≤80 chars. |
| `teamSize` | string | Optional, one of `1`, `2-10`, `11-50`, `51-200`, `200+`. |
| `useCase` | string | Optional, ≤1000 chars. Newlines are collapsed to spaces. |
| `source` | string | Optional, ≤100 chars. |
| `website` | string | Honeypot. Hide it from people (`position:absolute; left:-9999px`, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), not with `type="hidden"`. |

Longer optional text is truncated, not rejected. Missing/empty optional fields are fine; an email plus consent is a complete signup.

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
| 400 | `CONSENT_REQUIRED` | `consent` | no | `consent !== true`. |
| 400 | `INVALID_FIELD` | the field | no | Wrong type, or `teamSize` not in the list. |
| 400 | `INVALID_JSON` / `INVALID_REQUEST` | — | no | Body isn't a JSON object. |
| 403 | `ORIGIN_NOT_ALLOWED` | — | no | Browser `Origin` is not this site or the allowlist. |
| 405 | `METHOD_NOT_ALLOWED` | — | no | Use POST. |
| 413 | `REQUEST_TOO_LARGE` | — | no | Body over 8 KB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | — | no | Send `application/json`. |
| 429 | `RATE_LIMITED` | — | yes | Too many attempts from one IP; honour `Retry-After` (seconds). |
| 502 | `WAITLIST_STORAGE_FAILED` | — | yes | Saving failed: the Google Sheets call, or (with no sheet configured) the email alert. |
| 503 | `WAITLIST_UNAVAILABLE` | — | yes | Neither the sheet nor email alerts are configured (alerts turned off and no Google env vars). |
| 500 | `WAITLIST_FAILED` | — | yes | Unexpected error. |

Suggested UI: disable the button while the request is in flight; on `ok` show a thank-you state; on a `field` error mark that input; on `retryable` show the message with a retry action.

## Spreadsheet

Rows go to the spreadsheet's **first tab**, or the tab named by `WAITLIST_SHEET_TAB`. Row 1 must be this header, columns A–J:

```
submitted_at | email | name | company | role | team_size | use_case | source | consent_version | status
```

- `submitted_at` is ISO-8601 UTC.
- `consent_version` is `WAITLIST_CONSENT_VERSION` in `api/_lib/waitlist.mjs`. Bump it when the consent wording changes.
- `status` starts as `waitlisted`. Change it by hand (e.g. `invited`, `active`, `unsubscribed`) as you work through beta invites; the API never rewrites existing rows.
- Values are written with `valueInputOption=RAW`, and anything starting with `= + - @` gets a leading `'`, so submitted text can't run as a formula in Sheets or in a CSV/Excel export.
- Duplicate check: column B is read before each append. Two simultaneous submits of the same new email can both land; this is rare and harmless.

## Email alerts

Every **new** signup (not repeats, honeypot hits or invalid submissions) sends one email to `graymattertechllc@gmail.com`:

- Subject: `[PoryGen] New beta waitlist signup: <email>`, with every field in a table.
- Reply-To is the person's address, so replying from Gmail reaches them directly.
- Sent server-side to `https://formsubmit.co/ajax/<address>`, identified by the stable site URL `https://porygen.vercel.app/`.
- With the sheet configured, the sheet is the record and a failed alert is only logged. Without the sheet, the email is the record and a failed alert returns 502.
- `WAITLIST_NOTIFY_EMAIL` overrides the address (or takes FormSubmit's random alias after activation); `off` disables alerts.

**One-time activation:** FormSubmit holds the first message for a new form and emails an **Activate Form** link to the inbox. Click it once for PoryGen; that first signup is still saved in the sheet, but its alert is not re-sent. After activating, FormSubmit offers a random alias you can put in `WAITLIST_NOTIFY_EMAIL` so the address isn't in requests.

## Setup (one time)

Email alerts need no setup beyond the activation click above. The sheet needs the steps below.


1. **Google Cloud project** → APIs & Services → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → **Create service account** (no roles needed) → Keys → **Add key → JSON**. Keep the file private; don't commit it.
3. **Spreadsheet:** **PoryGen Beta Waitlist** already exists, with the header row, in the owner's Drive folder *Beta Waitlists* (next to the Studigo, APEX, FundMatch and Spread sheets). One service account serves all five products.
4. **Share the *Beta Waitlists* folder** with the service account's `client_email` as **Editor**. Every sheet inside inherits access, and the service account can't see anything else in your Drive.
5. In **Vercel → Project → Settings → Environment Variables** (Production and Preview), set:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` from the JSON
   - `GOOGLE_PRIVATE_KEY` = `private_key` from the JSON (as-is, with its `\n` sequences)
   - `WAITLIST_SPREADSHEET_ID` = the ID between `/d/` and `/edit` in the sheet URL
   - optional `WAITLIST_NOTIFY_EMAIL` (default `graymattertechllc@gmail.com`, a FormSubmit alias, or `off`), `WAITLIST_SHEET_TAB`, `WAITLIST_ALLOWED_ORIGINS` (comma-separated, e.g. `http://localhost:5173` for local dev against a deployed API)
6. Redeploy, then check:

```sh
curl -sS -X POST https://porygen.vercel.app/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","consent":true,"source":"setup-check"}'
```

Expect `{"ok":true,"status":"joined"}`, a new row, and an alert email (or, the very first time, FormSubmit's activation email). A `503 WAITLIST_UNAVAILABLE` means alerts are off and a Google env var is missing; a `502` usually means the sheet isn't shared with the service account, `WAITLIST_SHEET_TAB` names a tab that doesn't exist, or the Sheets API isn't enabled (the Vercel function log shows the Google HTTP status).

Local dev: `vite` doesn't serve `/api`. Run `vercel dev` with the env vars in `.env.local`, or point the form at a preview deployment and add the local origin to `WAITLIST_ALLOWED_ORIGINS`.

## Abuse controls

- Same-origin `Origin` check (plus allowlist); requests with no `Origin` (curl, server-side) are accepted, since they aren't browser CSRF.
- 8 KB body cap, JSON only, strict types, enum `teamSize`.
- Honeypot `website` field: filled → fake success, nothing stored.
- In-memory rate limit of 10 attempts per IP per 10 minutes. This only counts within one warm function instance, so it's best-effort; for a durable limit add a **Vercel Firewall rate-limit rule** on `/api/waitlist`.
- Errors never echo Google responses or credentials to the client.

## Privacy

Unlike scan source, waitlist contact details **are deliberately stored** in the Google Sheet and sent by email through FormSubmit to the Gray Matter Gmail inbox (Google and FormSubmit are subprocessors). No IP address, user agent or scan data goes into the row. Mention the waitlist in the planned Privacy Policy, and honour removal requests by deleting the row.
