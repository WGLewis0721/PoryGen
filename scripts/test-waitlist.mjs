import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { createSheetsStore, signServiceAccountJwt, normalizePrivateKey } from '../api/_lib/google-sheets.mjs';
import { createWaitlistHandler, createRateLimiter, validateSubmission, toRow, cell, SHEET_HEADERS, WAITLIST_CONSENT_VERSION } from '../api/_lib/waitlist.mjs';
import deployedHandler from '../api/waitlist.mjs';

const valid = { email: '  Ada@Example.COM ', name: 'Ada', company: 'Analytical', role: 'Engineer', teamSize: '2-10', useCase: 'Check AI output', source: 'landing', consent: true };

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
  assert.deepEqual(store.rows[0], ['2026-10-03T12:00:00.000Z', 'ada@example.com', 'Ada', 'Analytical', 'Engineer', '2-10', 'Check AI output', 'landing', WAITLIST_CONSENT_VERSION, 'waitlisted']);
});

test('email-only signup is enough', async () => {
  const { store, handler } = make();
  const res = await call(handler, { email: 'solo@example.dev', consent: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(store.rows[0].slice(1, 8), ['solo@example.dev', '', '', '', '', '', '']);
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
    [{ email: 'a@b.co' }, 'CONSENT_REQUIRED', 'consent'],
    [{ email: 'a@b.co', consent: 'yes' }, 'CONSENT_REQUIRED', 'consent'],
    [{ email: 'a@b.co', consent: true, teamSize: '7' }, 'INVALID_FIELD', 'teamSize'],
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
  const big = await call(handler, { ...valid, useCase: 'x'.repeat(9000) });
  assert.equal(big.statusCode, 413);
});

test('free text is trimmed, single-lined, length-capped and formula-safe', () => {
  const entry = validateSubmission({ ...valid, name: '  =HYPERLINK("http://evil")  ', useCase: 'line one\n\nline\ttwo', company: 'x'.repeat(500) });
  assert.equal(entry.useCase, 'line one line two');
  assert.equal(entry.company.length, 120);
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
  assert.match(google.calls[2].url, /\/values\/A%3AJ:append\?/);
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
