import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { createSheetsStore, signServiceAccountJwt, normalizePrivateKey } from '../api/_lib/google-sheets.mjs';
import { createWaitlistHandler, createRateLimiter, validateSubmission, toRow, cell, SHEET_HEADERS, WAITLIST_CONSENT_VERSION } from '../api/_lib/waitlist.mjs';
import { createFormSubmitNotifier } from '../api/_lib/formsubmit.mjs';

// Includes the extra fields the homepage form sends; they must be ignored.
const valid = { email: '  Ada@Example.COM ', name: 'Ada', consent: true, product: 'PoryGen', source: 'homepage' };

function memoryStore() {
  const rows = [];
  return { rows, hasEmail: async email => rows.some(row => row[1] === email), appendRow: async row => { rows.push(row); } };
}

async function call(handler, body, { method = 'POST', type = 'application/json', headers = {}, raw } = {}) {
  const req = Readable.from(method === 'POST' ? [raw ?? JSON.stringify(body)] : []);
  Object.assign(req, { method, headers: { 'content-type': type, host: 'porygen.vercel.app', 'x-forwarded-for': '203.0.113.7', ...headers } });
  const res = { statusCode: 200, headers: {}, payload: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; } };
  await handler(req, res);
  return res;
}

const quiet = { error() {} };
const make = (options = {}) => {
  const store = options.store ?? memoryStore();
  return { store, handler: createWaitlistHandler({ store, now: () => new Date('2026-10-03T12:00:00Z'), log: quiet, ...options }) };
};

test('valid signup appends one normalized row in header order', async () => {
  const { store, handler } = make();
  const res = await call(handler, valid);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, status: 'joined' });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].length, SHEET_HEADERS.length);
  assert.deepEqual(store.rows[0], ['2026-10-03T12:00:00.000Z', 'ada@example.com', 'Ada', WAITLIST_CONSENT_VERSION, 'waitlisted']);
});

test('email-only signup is enough', async () => {
  const { store, handler } = make();
  const res = await call(handler, { email: 'solo@example.dev' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(store.rows[0].slice(1, 3), ['solo@example.dev', '']);
  assert.deepEqual(validateSubmission(valid), { email: 'ada@example.com', name: 'Ada' });
});

test('duplicate email is not stored twice and the response does not reveal it', async () => {
  const { store, handler } = make();
  const first = await call(handler, valid);
  const second = await call(handler, { ...valid, email: 'ADA@example.com' });
  assert.deepEqual(second.payload, first.payload);
  assert.equal(second.statusCode, first.statusCode);
  assert.equal(store.rows.length, 1);
});

test('validation errors name the field', async () => {
  const { store, handler } = make();
  for (const [body, code, field] of [
    [{ consent: true }, 'EMAIL_REQUIRED', 'email'],
    [{ email: 'not-an-email', consent: true }, 'INVALID_EMAIL', 'email'],
    [{ email: 'a@b', consent: true }, 'INVALID_EMAIL', 'email'],
    [{ email: `${'a'.repeat(250)}@x.io`, consent: true }, 'INVALID_EMAIL', 'email'],
    [{ email: 'a@b.co', consent: false }, 'CONSENT_REQUIRED', 'consent'],
    [{ email: 'a@b.co', consent: true, name: 42 }, 'INVALID_FIELD', 'name'],
  ]) {
    const res = await call(handler, body);
    assert.equal(res.statusCode, 400, code);
    assert.equal(res.payload.code, code);
    assert.equal(res.payload.field, field);
    assert.equal(res.payload.retryable, false);
  }
  assert.equal(store.rows.length, 0);
});

test('request shape boundaries', async () => {
  const { handler } = make();
  const get = await call(handler, undefined, { method: 'GET' });
  assert.equal(get.statusCode, 405); assert.equal(get.headers.allow, 'POST');
  assert.equal((await call(handler, valid, { type: 'text/plain' })).statusCode, 415);
  assert.equal((await call(handler, null, { raw: '{oops' })).payload.code, 'INVALID_JSON');
  assert.equal((await call(handler, null, { raw: '[]' })).payload.code, 'INVALID_REQUEST');
  const big = await call(handler, { ...valid, padding: 'x'.repeat(9000) });
  assert.equal(big.statusCode, 413);
});

test('free text is trimmed, single-lined, length-capped and formula-safe', () => {
  assert.equal(validateSubmission({ ...valid, name: '  Ada\n\nLove\tlace ' }).name, 'Ada Love lace');
  assert.equal(validateSubmission({ ...valid, name: 'x'.repeat(500) }).name.length, 100);
  const entry = validateSubmission({ ...valid, name: '  =HYPERLINK("http://evil")  ' });
  const row = toRow(entry, '2026-10-03T12:00:00.000Z');
  assert.equal(row[2], `'=HYPERLINK("http://evil")`);
  for (const prefix of ['=', '+', '-', '@']) assert.equal(cell(`${prefix}1`), `'${prefix}1`);
  assert.equal(cell('plain'), 'plain');
});

test('honeypot submissions look successful but store nothing', async () => {
  const { store, handler } = make();
  const res = await call(handler, { ...valid, website: 'http://spam.example' });
  assert.deepEqual(res.payload, { ok: true, status: 'joined' });
  assert.equal(store.rows.length, 0);
});

test('cross-origin browser posts are rejected; same-origin and allowlisted pass', async () => {
  const { handler } = make({ allowedOrigins: ['http://localhost:5173'] });
  assert.equal((await call(handler, valid, { headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await call(handler, valid, { headers: { origin: 'https://porygen.vercel.app' } })).statusCode, 200);
  assert.equal((await call(handler, valid, { headers: { origin: 'http://localhost:5173' } })).statusCode, 200);
});

test('rate limit returns 429 with Retry-After per client IP', async () => {
  let t = 0;
  const { handler } = make({ rateLimit: createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t }) });
  assert.equal((await call(handler, valid)).statusCode, 200);
  assert.equal((await call(handler, valid)).statusCode, 200);
  const limited = await call(handler, valid);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.payload.retryable, true);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal((await call(handler, valid, { headers: { 'x-forwarded-for': '198.51.100.1' } })).statusCode, 200);
  t = 61_000;
  assert.equal((await call(handler, valid)).statusCode, 200);
});

test('unconfigured storage is a retryable 503, storage failure a retryable 502', async () => {
  const off = createWaitlistHandler({ store: null, log: quiet });
  const res = await call(off, valid);
  assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'WAITLIST_UNAVAILABLE'); assert.equal(res.payload.retryable, true);
  const { handler } = make({ store: { hasEmail: async () => false, appendRow: async () => { throw new Error('boom'); } } });
  const failed = await call(handler, valid);
  assert.equal(failed.statusCode, 502); assert.equal(failed.payload.code, 'WAITLIST_STORAGE_FAILED');
  assert.ok(!JSON.stringify(failed.payload).includes('boom'));
});

test('deployed handler without Google env vars answers 503, not a crash', async () => {
  // Alerts off so the test never emails the real inbox; the module reads env at import.
  process.env.WAITLIST_NOTIFY_EMAIL = 'off';
  const { default: deployedHandler } = await import('../api/waitlist.mjs');
  const res = await call(deployedHandler, { email: 'env@example.com', consent: true });
  assert.equal(res.statusCode, 503);
});

// --- Google Sheets client ---------------------------------------------------

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

test('service-account JWT is RS256-signed with the Sheets scope', () => {
  const jwt = signServiceAccountJwt({ clientEmail: 'bot@proj.iam.gserviceaccount.com', privateKey: pem, now: 1_700_000_000_000 });
  const [header, claims, signature] = jwt.split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'));
  const decoded = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.deepEqual(decoded, { iss: 'bot@proj.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600 });
  assert.equal(normalizePrivateKey(pem.replace(/\n/g, '\\n')), pem.trim());
});

function fakeGoogle({ emails = [], fail } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (fail && url.includes(fail.match)) return { ok: false, status: fail.status, json: async () => ({}) };
    if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: `token-${calls.length}`, expires_in: 3600 });
    if (init.method === 'GET') return ok(emails.length ? { values: [emails] } : {});
    return ok({ updates: { updatedRows: 1 } });
  };
  return { calls, fetch };
}

test('Sheets store reads emails, appends RAW rows and reuses its token', async () => {
  const google = fakeGoogle({ emails: ['Taken@Example.com'] });
  const store = createSheetsStore({ clientEmail: 'bot@x', privateKey: pem.replace(/\n/g, '\\n'), spreadsheetId: 'sheet123', tab: "Beta's list", fetch: google.fetch });
  assert.equal(await store.hasEmail('taken@example.com'), true);
  assert.equal(await store.hasEmail('new@example.com'), false);
  await store.appendRow(['a', 'b']);
  const tokenCalls = google.calls.filter(c => c.url.includes('oauth2'));
  assert.equal(tokenCalls.length, 1);
  assert.match(String(tokenCalls[0].init.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  const read = google.calls[1];
  assert.equal(read.url, `https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/${encodeURIComponent("'Beta''s list'!B2:B")}?majorDimension=COLUMNS`);
  assert.equal(read.init.headers.authorization, 'Bearer token-1');
  const append = google.calls.at(-1);
  assert.match(append.url, /:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/);
  assert.deepEqual(JSON.parse(append.init.body), { values: [['a', 'b']] });
});

test('Sheets store without a tab name targets the first tab', async () => {
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 's', fetch: google.fetch });
  await store.hasEmail('a@b.co');
  await store.appendRow(['x']);
  assert.match(google.calls[1].url, /\/values\/B2%3AB\?/);
  assert.match(google.calls[2].url, /\/values\/A%3AE:append\?/);
});

test('Sheets store refreshes an expired token and surfaces HTTP failures', async () => {
  let t = 0;
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 's', fetch: google.fetch, now: () => t });
  await store.hasEmail('a@b.co');
  t = 3_600_000;
  await store.hasEmail('a@b.co');
  assert.equal(google.calls.filter(c => c.url.includes('oauth2')).length, 2);
  const broken = createSheetsStore({ clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 's', fetch: fakeGoogle({ fail: { match: ':append', status: 403 } }).fetch });
  await assert.rejects(broken.appendRow(['x']), error => error.name === 'SheetsError' && error.status === 403);
});

test('end to end: handler + Sheets store against a fake Google', async () => {
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: 'bot@x', privateKey: pem, spreadsheetId: 's', fetch: google.fetch });
  const handler = createWaitlistHandler({ store, now: () => new Date('2026-10-03T12:00:00Z'), log: quiet });
  const res = await call(handler, valid);
  assert.equal(res.statusCode, 200);
  const row = JSON.parse(google.calls.at(-1).init.body).values[0];
  assert.equal(row[1], 'ada@example.com');
});

// --- Email alert (FormSubmit) -------------------------------------------------

function recordingNotifier(fail = false) {
  const sent = [];
  return { sent, notifier: { notify: async (entry, submittedAt) => { if (fail) throw new Error('relay down'); sent.push({ email: entry.email, submittedAt }); } } };
}

test('a new signup is saved, then alerted once; a repeat signup is not alerted again', async () => {
  const { sent, notifier } = recordingNotifier();
  const { store, handler } = make({ notifier });
  await call(handler, valid);
  await call(handler, { ...valid, email: 'ADA@example.com' });
  assert.equal(store.rows.length, 1);
  assert.deepEqual(sent, [{ email: 'ada@example.com', submittedAt: '2026-10-03T12:00:00.000Z' }]);
});

test('with a sheet, a failed alert is logged and the signup still succeeds', async () => {
  const errors = [];
  const { store, handler } = make({ notifier: recordingNotifier(true).notifier, log: { error: (...args) => errors.push(args) } });
  assert.equal((await call(handler, valid)).statusCode, 200);
  assert.equal(store.rows.length, 1);
  assert.equal(errors.length, 1);
});

test('without the sheet, a configured alert does not make a signup succeed', async () => {
  const ok = recordingNotifier();
  const res = await call(createWaitlistHandler({ store: null, notifier: ok.notifier, log: quiet }), valid);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'WAITLIST_UNAVAILABLE');
  assert.equal(ok.sent.length, 0);
});

test('simultaneous submissions of one new email store a single row', async () => {
  const rows = [];
  const wait = () => new Promise(resolve => setTimeout(resolve, 20));
  const slow = { hasEmail: async email => { await wait(); return rows.some(row => row[1] === email); }, appendRow: async row => { await wait(); rows.push(row); } };
  const { sent, notifier } = recordingNotifier();
  const handler = createWaitlistHandler({ store: slow, notifier, log: quiet });
  const results = await Promise.all([call(handler, valid), call(handler, valid), call(handler, { ...valid, email: 'ADA@example.com' })]);
  assert.deepEqual(results.map(r => r.statusCode), [200, 200, 200]);
  assert.equal(rows.length, 1);
  assert.equal(sent.length, 1);
});

test('a same-email burst shares one sheet read instead of queueing one per request', async () => {
  let reads = 0;
  const rows = [];
  const slow = { hasEmail: async email => { reads++; await new Promise(r => setTimeout(r, 20)); return rows.some(row => row[1] === email); }, appendRow: async row => { rows.push(row); } };
  const handler = createWaitlistHandler({ store: slow, log: quiet });
  await Promise.all(Array.from({ length: 8 }, () => call(handler, valid)));
  assert.equal(reads, 1);
  assert.equal(rows.length, 1);
});

test('emails starting with a formula character or apostrophe are refused, so stored emails stay verbatim', async () => {
  const { store, handler } = make();
  for (const email of ['+tag@example.com', '-x@example.com', '=cmd@example.com', "'foo@example.com"]) {
    const res = await call(handler, { email });
    assert.equal(res.statusCode, 400, email);
    assert.equal(res.payload.code, 'INVALID_EMAIL');
  }
  assert.equal(store.rows.length, 0);
  await call(handler, { email: 'user+tag@example.com' });
  assert.equal(store.rows[0][1], 'user+tag@example.com');
});

test('honeypot and invalid submissions never send an alert', async () => {
  const { sent, notifier } = recordingNotifier();
  const { handler } = make({ notifier });
  await call(handler, { ...valid, website: 'spam' });
  await call(handler, { email: 'bad', consent: true });
  assert.equal(sent.length, 0);
});

function fakeFormSubmit({ status = 200, body = { success: 'true', message: 'The form was submitted successfully.' } } = {}) {
  const calls = [];
  return { calls, fetch: async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, json: async () => body }; } };
}

test('FormSubmit alert: endpoint, headers, subject, reply-to and fields', async () => {
  const relay = fakeFormSubmit();
  const notifier = createFormSubmitNotifier({ to: 'graymattertechllc@gmail.com', product: 'PoryGen', siteUrl: 'https://porygen.vercel.app/', fetch: relay.fetch });
  await notifier.notify(validateSubmission({ ...valid, name: '=SUM(1)' }), '2026-10-03T12:00:00.000Z');
  const [{ url, init }] = relay.calls;
  assert.equal(url, 'https://formsubmit.co/ajax/graymattertechllc%40gmail.com');
  assert.equal(init.headers.referer, 'https://porygen.vercel.app/');
  assert.equal(init.headers.origin, 'https://porygen.vercel.app');
  assert.equal(init.headers.accept, 'application/json');
  const body = JSON.parse(init.body);
  assert.equal(body._subject, '[PoryGen] New beta waitlist signup: ada@example.com');
  assert.equal(body._replyto, 'ada@example.com');
  assert.equal(body.name, '=SUM(1)');
  assert.equal(body.consent_version, WAITLIST_CONSENT_VERSION);
});

test('FormSubmit alert rejects unconfirmed delivery, including the activation reply', async () => {
  const entry = validateSubmission(valid);
  const pending = createFormSubmitNotifier({ to: 'o@example.com', product: 'P', siteUrl: 'https://p.example/', fetch: fakeFormSubmit({ body: { success: 'false', message: 'This form needs Activation.' } }).fetch });
  await assert.rejects(pending.notify(entry, 't'), error => /needs Activation/.test(error.message));
  const down = createFormSubmitNotifier({ to: 'o@example.com', product: 'P', siteUrl: 'https://p.example/', fetch: fakeFormSubmit({ status: 500, body: {} }).fetch });
  await assert.rejects(down.notify(entry, 't'), error => error.name === 'NotifyError' && error.status === 500);
});
