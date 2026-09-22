import test from "node:test";
import assert from "node:assert/strict";
import { buildReferenceIndex } from "../lib/search.mjs";
import { createSearchServer } from "../server.mjs";

const referenceSource = `
export function stableSort(values) {
  return [...values].sort((a, b) => a.value - b.value);
}
`;

const referenceIndex = buildReferenceIndex([{
  id: "sort",
  repository: "public/source",
  commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  path: "sort.js",
  language: "javascript",
  license: "MIT",
  licenseUrl: "https://example.test/license",
  sourceUrl: "https://example.test/source",
  source: referenceSource,
}]);

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

test("scan endpoint is POST-only and no-store", async () => {
  const repositoryFetcher = async () => { throw new Error("should not run"); };
  await withServer({ referenceIndex, repositoryFetcher }, async (base) => {
    const getResponse = await fetch(`${base}/api/scan?repositoryUrl=secret`);
    assert.equal(getResponse.status, 405);
    assert.equal(getResponse.headers.get("cache-control"), "no-store");

    const postResponse = await fetch(`${base}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "" }),
    });
    assert.equal(postResponse.status, 400);
    assert.equal(postResponse.headers.get("cache-control"), "no-store");
  });
});

test("one scan automatically fetches, compares and returns an action-ready finding", async () => {
  let calls = 0;
  const repositoryFetcher = async (url) => {
    calls += 1;
    assert.equal(url, "https://github.com/customer/project");
    return {
      repository: "customer/project",
      repositoryUrl: url,
      commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      commitUrl: "https://github.com/customer/project/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      defaultBranch: "main",
      files: [{ path: "src/sort.js", language: "javascript", bytes: 100, source: referenceSource }],
      stats: { fetchedFiles: 1, fetchedBytes: 100, treeTruncated: false, stoppedForLimit: false, skippedCount: 0, elapsedMs: 2 },
      skipped: [],
      partial: false,
    };
  };

  await withServer({ referenceIndex, repositoryFetcher }, async (base) => {
    const response = await fetch(`${base}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "https://github.com/customer/project" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(calls, 1);
    assert.equal(data.repository.commit.startsWith("bbbb"), true);
    assert.ok(data.findings.length >= 1);
    assert.ok(data.findings.some((finding) => finding.publicSource?.url));
  });
});

test("unrelated repository code can return insufficient evidence", async () => {
  const repositoryFetcher = async (url) => ({
    repository: "customer/unrelated",
    repositoryUrl: url,
    commit: "cccccccccccccccccccccccccccccccccccccccc",
    commitUrl: "https://github.com/customer/unrelated/commit/cccccccccccccccccccccccccccccccccccccccc",
    defaultBranch: "main",
    files: [{
      path: "src/math.js",
      language: "javascript",
      bytes: 120,
      source: "export function triangular(n) { let t = 0; for (let i = 0; i < n; i++) t += i; return t; }",
    }],
    stats: { fetchedFiles: 1, fetchedBytes: 120, treeTruncated: false, stoppedForLimit: false, skippedCount: 0, elapsedMs: 1 },
    skipped: [],
    partial: false,
  });

  await withServer({ referenceIndex, repositoryFetcher }, async (base) => {
    const response = await fetch(`${base}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repositoryUrl: "https://github.com/customer/unrelated" }),
    });
    const data = await response.json();
    assert.ok(data.findings.every((finding) => finding.classification === "insufficient_evidence"));
  });
});
