import assert from 'node:assert/strict';
import { test } from 'node:test';

// Run against a deployed preview before promoting it. This deliberately tests
// HTTP entry points: client navigation and Vite's dev fallback hide missing
// hosting rewrites.
const base = process.env.PORYGEN_BASE_URL;
if (!base) throw new Error('Set PORYGEN_BASE_URL to the deployment to test.');
const origin = new URL(base);
if (!['https:', 'http:'].includes(origin.protocol)) throw new Error('Expected an HTTP(S) deployment URL.');

async function read(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `${path} must load directly (including after refresh)`);
  return { response, body: await response.text() };
}

for (const path of ['/', '/sign-up', '/sign-in', '/demo', '/repositories/new', '/scans/qa-smoke/findings/qa-smoke']) {
  test(`direct navigation: ${path}`, async () => {
    const { response, body } = await read(path);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(body, /id=["']root["']/);
    assert.match(body, /<script\b[^>]*type=["']module["']/);
  });
}

test('the SPA fallback preserves actual JavaScript and stylesheet assets', async () => {
  const { body } = await read('/');
  const script = body.match(/<script\b[^>]*src=["']([^"']+)["']/)?.[1];
  const stylesheet = body.match(/<link\b[^>]*href=["']([^"']+\.css)["']/)?.[1];
  assert.ok(script, 'built module script must exist');
  assert.ok(stylesheet, 'built stylesheet must exist');
  for (const [path, mime] of [[script, /javascript/], [stylesheet, /text\/css/]]) {
    assert.equal(new URL(path, origin).origin, origin.origin, 'test only same-origin build assets');
    const { response, body: asset } = await read(path);
    assert.match(response.headers.get('content-type') ?? '', mime);
    assert.doesNotMatch(asset, /<!doctype html>/i, 'assets must not be rewritten to the app shell');
  }
});
