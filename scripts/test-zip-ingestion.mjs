import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { ingestUpload, UPLOAD_LIMITS } from '../labs/source-search-lab/lib/upload-source.mjs';
import { scanUpload } from '../labs/source-search-lab/lib/upload-service.mjs';
import { scanRepository } from '../labs/source-search-lab/lib/scan-service.mjs';
import { fetchPublicGitHubRepository } from '../labs/source-search-lab/lib/github-source.mjs';
import handler from '../api/scan.mjs';

const index = JSON.parse(readFileSync(new URL('../labs/source-search-lab/data/reference-index.json', import.meta.url)));
const terms = { termsVersion: '2026-09-22-v1', termsAcceptedAt: '2026-09-22T12:00:00Z' };
const js = 'export function increment(value) { return value + 1; }';
// Minimal ZIP fixture writer; no extraction code is shared with production.
function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path), data = Buffer.from(entry.content ?? js);
    const packed = entry.deflate ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6); local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(entry.crc ?? crc32(data), 14); local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.size ?? data.length, 22); local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    local.copy(central, 8, 6, 28);
    central.writeUInt32LE(((entry.mode ?? 0x81a4) << 16) >>> 0, 38); central.writeUInt32LE(entry.offset ?? offset, 42);
    locals.push(local, name, packed); centrals.push(central, name); offset += local.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(centrals);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const upload = (entries, extra = {}) => ({ sourceType: 'zip', archiveBase64: zip(entries).toString('base64'), ...extra });
const rejects = (input, code, options) => assert.rejects(ingestUpload(input, options), error => error.code === code);
async function api(body, { method = 'POST', stream = false, type = 'application/json' } = {}) {
  const req = stream ? Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]) : { body };
  req.method = method; req.headers = { 'content-type': type };
  const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(v) { this.payload = v; return this; } };
  await handler(req, res); return { ...res, headers };
}

test('ZIP and folder source converge on the same files, including Python', async () => {
  const entries = [{ path: 'src/app.ts', content: js, deflate: true }, { path: 'lib/example.py', content: 'def inc(x):\n    return x + 1\n' }];
  const a = await ingestUpload(upload(entries));
  const b = await ingestUpload({ sourceType: 'files', files: entries });
  assert.deepEqual(a.files, b.files); assert.equal(a.commit, b.commit); assert.equal(a.stats.treeComplete, false);
});
for (const path of ['../escape.ts', '/abs.ts', 'C:/escape.ts', 'src/../escape.ts', 'src\\escape.ts', 'src/%2e%2e/escape.ts', 'src/./escape.ts']) {
  test(`reject unsafe path ${path}`, async () => {
    await assert.rejects(ingestUpload(upload([{ path }])));
    await rejects({ sourceType: 'files', files: [{ path, content: js }] }, 'UNSAFE_PATH');
  });
}
test('reject symlinks, special files, encryption, duplicate paths', async () => {
  await rejects(upload([{ path: 'link.ts', mode: 0xa1ff }]), 'UNSAFE_ENTRY');
  await rejects(upload([{ path: 'device.ts', mode: 0x21ff }]), 'UNSAFE_ENTRY');
  await assert.rejects(ingestUpload(upload([{ path: 'secret.ts', flags: 1 }])));
  await rejects(upload([{ path: 'a.ts' }, { path: 'a.ts' }]), 'DUPLICATE_PATH');
  await rejects(upload([{ path: 'hidden/link.ts', mode: 0xa1ff }], { exclusions: ['hidden'] }), 'UNSAFE_ENTRY');
});
test('reject malformed, truncated, CRC-corrupt and size-mismatched archives', async () => {
  await rejects({ sourceType: 'zip', archiveBase64: 'garbage!' }, 'INVALID_ARCHIVE');
  await rejects({ sourceType: 'zip', archiveBase64: zip([{ path: 'a.js' }]).subarray(0, 35).toString('base64') }, 'INVALID_ARCHIVE');
  await rejects(upload([{ path: 'a.js', crc: 42 }]), 'INVALID_ARCHIVE');
  await rejects(upload([{ path: 'a.js', deflate: true, size: 2 }]), 'INVALID_ARCHIVE');
  await rejects(upload([{ path: 'a.js' }, { path: 'b.js', offset: 0 }]), 'INVALID_ARCHIVE');
});
test('compressed, expanded, entry-count and time limits are enforced', async () => {
  const input = upload([{ path: 'a.ts' }, { path: 'b.ts' }]);
  const limits = overrides => ({ limits: { ...UPLOAD_LIMITS, ...overrides } });
  await rejects(input, 'UPLOAD_TOO_LARGE', limits({ maxArchiveBytes: 30 }));
  await rejects(input, 'EXTRACTED_SIZE_LIMIT', limits({ maxExtractedBytes: 10 }));
  await rejects(input, 'TOO_MANY_FILES', limits({ maxEntries: 1 }));
  await rejects(input, 'PROCESSING_TIMEOUT', limits({ maxProcessingMs: 0 }));
  await rejects(upload([{ path: 'bomb.js', content: 'x'.repeat(2000000), deflate: true }]), 'SUSPICIOUS_ARCHIVE');
});
test('exclusions are pre-matcher, deterministic, segment-safe and auditable', async () => {
  const source = await ingestUpload(upload([{ path: 'starter/a.ts' }, { path: 'starterish/a.ts' }, { path: 'src/a.ts' }], { exclusions: ['starter/', 'starter'] }));
  assert.deepEqual(source.files.map(f => f.path), ['src/a.ts', 'starterish/a.ts']);
  assert.deepEqual(source.stats.exclusions, ['starter']); assert.equal(source.stats.excludedFiles, 1);
  assert.equal(source.partial, false); assert.ok(source.stats.supportedFilesInTree.includes('starter/a.ts'));
  await rejects(upload([], { exclusions: ['**/*.ts'] }), 'INVALID_EXCLUSIONS');
});
test('nested archives, dependencies, generated files and binaries never enter matching', async () => {
  const result = await ingestUpload(upload([{ path: 'src/a.ts' }, { path: 'node_modules/a.ts' }, { path: 'build/a.ts' }, { path: 'src/a.generated.ts' }, { path: 'nested.zip' }, { path: 'fake.ts', content: '\0binary' }]));
  assert.deepEqual(result.files.map(f => f.path), ['src/a.ts']);
  assert.equal(result.stats.ingestion.skippedReasons.nested_archive, 1);
  assert.equal(result.stats.ingestion.skippedReasons.binary, 1); assert.equal(result.partial, true);
});
test('per-file and source budgets produce honest partial metadata', async () => {
  const result = await ingestUpload(upload([{ path: 'big.js', content: 'x'.repeat(100001) }, { path: 'a.ts' }, { path: 'b.ts' }]), { limits: { ...UPLOAD_LIMITS, maxFiles: 1 } });
  assert.equal(result.files.length, 1); assert.equal(result.partial, true);
  assert.deepEqual(result.stats.incompleteReasons, { file_too_large: 1, file_limit: 1 });
});
test('worker runs the existing engine, and excludes exact indexed source before comparison', async () => {
  const doc = index.documents[0];
  const input = { sourceType: 'files', files: [{ path: doc.path, content: doc.source }] };
  const result = await scanUpload(input, index);
  assert.equal(result.status, 200); assert.ok(result.payload.summary.strong > 0);
  const excluded = await scanUpload({ ...input, exclusions: [doc.path] }, index);
  assert.equal(excluded.payload.summary.total, 0); assert.equal(excluded.payload.scan.excludedFiles, 1);
  assert.equal(excluded.payload.scan.ingestion.empty, true);
});
test('hard worker deadline returns structured failure', async () => {
  const result = await scanUpload({ sourceType: 'files', files: [] }, index, { timeoutMs: 1 });
  assert.equal(result.status, 408); assert.equal(result.payload.code, 'PROCESSING_TIMEOUT');
});
test('GitHub excludes before fetching selected source and preserves default behavior', async () => {
  const paths = [];
  const fetchImpl = async url => {
    paths.push(url);
    const body = url.endsWith('/repo') ? { default_branch: 'main' } : url.includes('/commits/') ? { sha: 'a', commit: { tree: { sha: 'b' } } } : url.includes('/git/trees/') ? { tree: [{ type: 'blob', path: 'starter/a.ts', size: 30 }, { type: 'blob', path: 'src/a.ts', size: 30 }] } : null;
    return { ok: true, json: async () => body, text: async () => js };
  };
  const result = await fetchPublicGitHubRepository('https://github.com/owner/repo', { fetchImpl, exclusions: ['starter'] });
  assert.equal(result.stats.excludedFiles, 1); assert.equal(paths.some(p => p.endsWith('/starter/a.ts')), false);
  const report = await scanRepository('https://github.com/owner/repo', { referenceIndex: index, repositoryFetcher: async () => result });
  assert.equal(report.status, 200); assert.equal(report.payload.source.type, 'github');
});
test('API preserves Terms, rejects bad contracts and sanitizes errors', async () => {
  assert.equal((await api({ sourceType: 'files', files: [] })).statusCode, 428);
  assert.equal((await api({ ...terms, sourceType: 'invalid' })).payload.code, 'INVALID_SOURCE_TYPE');
  assert.equal((await api({ ...terms, sourceType: 'files', files: [], repositoryUrl: 'x' })).payload.code, 'AMBIGUOUS_SOURCE');
  assert.equal((await api('{bad', { stream: true })).payload.code, 'INVALID_JSON');
  assert.equal((await api({}, { type: 'text/plain' })).statusCode, 415);
  assert.equal((await api({}, { method: 'GET' })).statusCode, 405);
  const result = await api({ ...terms, sourceType: 'files', files: [{ path: 'a.ts', content: js }] }, { stream: true });
  assert.equal(result.statusCode, 200); assert.equal(result.payload.scan.fetchedFiles, 1); assert.equal(result.headers['Cache-Control'], 'no-store');
  const bad = await api({ ...terms, sourceType: 'zip', archiveBase64: 'SECRET_SOURCE' });
  assert.equal(bad.statusCode, 400); assert.equal(JSON.stringify(bad.payload).includes('SECRET_SOURCE'), false);
});
test('API rejects oversize parsed and streamed bodies', async () => {
  const body = { ...terms, sourceType: 'files', files: [], padding: 'x'.repeat(4_000_000) };
  assert.equal((await api(body)).statusCode, 413);
  assert.equal((await api(body, { stream: true })).statusCode, 413);
});

test('real HTTP ZIP request reaches the production handler and existing engine', async () => {
  const server = createServer((req, res) => {
    res.status = status => { res.statusCode = status; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const doc = index.documents[0];
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...terms, ...upload([{ path: doc.path, content: doc.source, deflate: true }]) }),
    });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json(); assert.ok(result.summary.strong > 0); assert.equal(result.source.type, 'zip');
    assert.equal(result.repository.url, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('per-instance worker concurrency is bounded without retaining queued uploads', async () => {
  const input = { sourceType: 'files', files: [] };
  const first = scanUpload(input, index), second = scanUpload(input, index);
  const busy = await scanUpload(input, index);
  assert.equal(busy.status, 429); assert.equal(busy.payload.code, 'SCAN_BUSY');
  await Promise.all([first, second]);
});
