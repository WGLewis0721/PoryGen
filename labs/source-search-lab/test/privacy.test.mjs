import test from "node:test";
import assert from "node:assert/strict";
import { createSearchServer } from "../server.mjs";

const docs = [
  { id: "1", title: "Winnowing fingerprints", tags: ["code"], body: "fingerprint similarity", url: "/sources/1.txt" }
];

async function withServer(options, fn) {
  const server = createSearchServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("search only accepts POST so query text is not placed in the URL", async () => {
  await withServer({ searchCorpus: docs }, async (base) => {
    const response = await fetch(`${base}/api/search?q=secret-source-code`);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  });
});

test("search responses explicitly forbid caching", async () => {
  await withServer({ searchCorpus: docs }, async (base) => {
    const response = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "winnowing" })
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("expires"), "0");
  });
});

test("private mode never sends an unmatched query to the web provider", async () => {
  let calls = 0;
  const webSearchFn = async () => {
    calls += 1;
    return { configured: true, results: [{ title: "should not appear", url: "https://example.com", snippet: "", source: "web" }] };
  };

  await withServer({ searchCorpus: docs, webSearchFn }, async (base) => {
    const secret = "private-customer-function-do-not-send";
    const response = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: secret })
    });
    const data = await response.json();
    assert.equal(calls, 0);
    assert.equal(data.externalWebSearch, "disabled");
    assert.equal(data.privacyProtected, true);
    assert.equal(JSON.stringify(data).includes(secret), false);
  });
});

test("external web fallback requires explicit opt-in", async () => {
  let received = null;
  const webSearchFn = async (query) => {
    received = query;
    return { configured: true, results: [{ title: "Web result", url: "https://example.com", snippet: "example", source: "web" }] };
  };

  await withServer({ searchCorpus: docs, webSearchFn }, async (base) => {
    const response = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "public demo query", allowExternalWebSearch: true })
    });
    const data = await response.json();
    assert.equal(received, "public demo query");
    assert.equal(data.source, "web");
    assert.equal(data.privacyProtected, false);
  });
});

test("successful responses do not echo the submitted query", async () => {
  await withServer({ searchCorpus: docs }, async (base) => {
    const secret = "winnowing";
    const response = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: secret })
    });
    const text = await response.text();
    assert.equal(text.includes(`"query":"${secret}"`), false);
  });
});

test("oversized request bodies are rejected", async () => {
  await withServer({ searchCorpus: docs }, async (base) => {
    const response = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "x".repeat(300_000) })
    });
    assert.equal(response.status, 400);
  });
});
