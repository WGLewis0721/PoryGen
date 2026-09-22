import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  buildReferenceIndex,
  makeRegions,
  retrieveCandidates,
  scanSourceFiles,
  tokenizeSource,
  verifyCandidate,
} from "../lib/search.mjs";

const javascriptSource = `
export class TinyQueue {
  constructor() {
    this.items = [];
  }

  enqueue(value) {
    this.items.push(value);
  }

  dequeue() {
    if (this.items.length === 0) {
      return undefined;
    }
    return this.items.shift();
  }
}
`;

const pythonSource = `
def dispatch_hook(key, hooks, hook_data, **kwargs):
    hooks = hooks or {}
    hooks = hooks.get(key)
    if hooks:
        if hasattr(hooks, "__call__"):
            hooks = [hooks]
        for hook in hooks:
            hook_data = hook(hook_data, **kwargs)
    return hook_data
`;

const typescriptSource = `
export function addBusinessDays(date: Date, amount: number): Date {
  const result = new Date(date);
  let remaining = Math.abs(amount);
  const sign = amount < 0 ? -1 : 1;

  while (remaining > 0) {
    result.setDate(result.getDate() + sign);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return result;
}
`;

const index = buildReferenceIndex([
  {
    id: "js-queue",
    repository: "example/js-queue",
    commit: "1111111111111111111111111111111111111111",
    path: "index.js",
    language: "javascript",
    license: "MIT",
    licenseUrl: "https://example.test/license",
    sourceUrl: "https://example.test/js",
    source: javascriptSource,
  },
  {
    id: "py-hooks",
    repository: "example/py-hooks",
    commit: "2222222222222222222222222222222222222222",
    path: "hooks.py",
    language: "python",
    license: "Apache-2.0",
    licenseUrl: "https://example.test/license2",
    sourceUrl: "https://example.test/py",
    source: pythonSource,
  },
  {
    id: "ts-business",
    repository: "example/ts-business",
    commit: "3333333333333333333333333333333333333333",
    path: "business.ts",
    language: "typescript",
    license: "MIT",
    licenseUrl: null,
    sourceUrl: "https://example.test/ts",
    source: typescriptSource,
  },
]);

test("tokenizer preserves identifiers in one representation and normalizes them in the other", () => {
  const preserving = tokenizeSource("function hello(name) { return name; }", "javascript");
  const normalized = tokenizeSource("function hello(name) { return name; }", "javascript", { normalizeIdentifiers: true });
  assert.ok(preserving.some((token) => token.kind === "id:hello"));
  assert.ok(normalized.some((token) => token.kind === "ID"));
  assert.equal(preserving.length, normalized.length);
});

test("regression: JavaScript private fields are identifiers, not hash comments", () => {
  const preserving = tokenizeSource("class Queue { #head; peek() { return this.#head; } }", "javascript");
  const normalized = tokenizeSource("class Queue { #head; peek() { return this.#head; } }", "javascript", { normalizeIdentifiers: true });

  assert.equal(preserving.filter((token) => token.kind === "id:#head").length, 2);
  assert.equal(preserving.some((token) => token.kind.includes("#head; peek")), false);
  assert.equal(normalized.filter((token) => token.kind === "ID").length >= 3, true);
});

test("regression: preserving tokens distinguish literal values while normalized tokens collapse them", () => {
  const aPreserving = tokenizeSource('const mode = "safe"; const limit = 12;', "javascript");
  const bPreserving = tokenizeSource('const mode = "unsafe"; const limit = 99;', "javascript");
  const aNormalized = tokenizeSource('const mode = "safe"; const limit = 12;', "javascript", { normalizeIdentifiers: true });
  const bNormalized = tokenizeSource('const mode = "unsafe"; const limit = 99;', "javascript", { normalizeIdentifiers: true });

  assert.notDeepEqual(aPreserving.map((token) => token.kind), bPreserving.map((token) => token.kind));
  assert.deepEqual(aNormalized.map((token) => token.kind), bNormalized.map((token) => token.kind));
  assert.ok(aPreserving.some((token) => token.kind === 'lit:"safe"'));
  assert.ok(aPreserving.some((token) => token.kind === "lit:12"));
});

test("Python triple-quoted strings remain one literal token instead of code-like words", () => {
  const source = 'def f():\n    """if return class fake_identifier"""\n    return 1\n';
  const preserving = tokenizeSource(source, "python");
  const normalized = tokenizeSource(source, "python", { normalizeIdentifiers: true });

  assert.equal(preserving.some((token) => token.kind === "kw:if"), false);
  assert.equal(preserving.some((token) => token.kind === "kw:class"), false);
  assert.equal(preserving.some((token) => token.kind.startsWith('lit:"""')), true);
  assert.equal(normalized.filter((token) => token.kind === "LIT").length, 2);
});

test("regression: JavaScript and TypeScript are compatible candidate languages", () => {
  const jsIndex = buildReferenceIndex([{
    id: "js-source",
    repository: "example/js",
    commit: "4444444444444444444444444444444444444444",
    path: "queue.js",
    language: "javascript",
    license: "MIT",
    sourceUrl: "https://example.test/js-source",
    source: javascriptSource,
  }]);
  const asTypeScript = javascriptSource.replace("export class TinyQueue", "export class TinyQueue");
  const { findings } = scanSourceFiles([{ path: "queue.ts", language: "typescript", source: asTypeScript }], jsIndex);

  assert.ok(findings.some((finding) =>
    finding.publicSource?.path === "queue.js" &&
    finding.classification !== "insufficient_evidence"
  ));
});

test("regression: repeated occurrences of one fingerprint do not inflate candidate score", () => {
  const region = {
    language: "javascript",
    fingerprints: {
      preserving: [{ hash: 101, position: 0 }, { hash: 202, position: 1 }],
      normalized: [],
    },
  };
  const fakeIndex = {
    documents: [
      { id: "repeat", language: "javascript" },
      { id: "diverse", language: "javascript" },
    ],
    postings: {
      preserving: {
        "101": [["repeat", 0], ["repeat", 7], ["repeat", 14], ["diverse", 0]],
        "202": [["diverse", 7]],
      },
      normalized: {},
    },
  };
  const ranked = retrieveCandidates(region, fakeIndex, {
    ...DEFAULT_SETTINGS,
    commonFingerprintRatio: 2,
  });

  assert.equal(ranked[0].docId, "diverse");
  assert.equal(ranked.find((candidate) => candidate.docId === "repeat").matchedHashes, 1);
});

test("exact source produces a strong match", () => {
  const { findings } = scanSourceFiles([{ path: "queue.js", language: "javascript", source: javascriptSource }], index);
  assert.ok(findings.some((finding) => finding.classification === "strong_match" && finding.publicSource?.path === "index.js"));
});

test("identifier renaming survives normalized fingerprint retrieval", () => {
  const renamed = javascriptSource
    .replaceAll("TinyQueue", "TaskBucket")
    .replaceAll("items", "records")
    .replaceAll("value", "entry");
  const { findings } = scanSourceFiles([{ path: "renamed.js", language: "javascript", source: renamed }], index);
  assert.ok(findings.some((finding) => finding.publicSource?.path === "index.js" && finding.classification !== "insufficient_evidence"));
});

test("formatting and comments do not defeat matching", () => {
  const formatted = `// comment\n${javascriptSource.replace(/\n+/g, "\n\n").replaceAll("  ", "    ")}`;
  const { findings } = scanSourceFiles([{ path: "formatted.js", language: "javascript", source: formatted }], index);
  assert.ok(findings.some((finding) => finding.publicSource?.path === "index.js" && finding.classification === "strong_match"));
});

test("partial fragments recover the expected source and report the actual fragment region", () => {
  const fragment = `
dequeue() {
  if (this.items.length === 0) {
    return undefined;
  }
  return this.items.shift();
}
`;
  const { findings } = scanSourceFiles([{ path: "fragment.js", language: "javascript", source: fragment }], index);
  const match = findings.find((finding) => finding.publicSource?.path === "index.js");

  assert.ok(match, "expected the queue fragment to recover index.js");
  assert.notEqual(match.classification, "insufficient_evidence");
  assert.ok(match.metrics.matchedTokens >= DEFAULT_SETTINGS.possibleMatchedTokens);
  assert.ok(match.metrics.contiguousTokens >= DEFAULT_SETTINGS.possibleContiguousTokens);
  assert.ok(match.customer.lines.start >= 2);
  assert.ok(match.customer.lines.end <= 7);
  assert.ok(match.publicSource.lines.start >= 1);
});

test("mixed JS/TS file recovers multiple independent public sources", () => {
  const mixed = `${javascriptSource}\n\n${typescriptSource}`;
  const { findings } = scanSourceFiles([{ path: "mixed.ts", language: "typescript", source: mixed }], index);
  const matchedPaths = new Set(
    findings
      .filter((finding) => finding.classification !== "insufficient_evidence")
      .map((finding) => finding.publicSource?.path),
  );

  assert.equal(matchedPaths.has("index.js"), true, "expected JavaScript source to match a TypeScript scan");
  assert.equal(matchedPaths.has("business.ts"), true, "expected the TypeScript source to remain independently detectable");
  assert.ok(matchedPaths.size >= 2);
});


test("fingerprints common across most indexed sources are softened to possible/common-pattern", () => {
  const common = `
export function clamp(value, low, high) {
  if (value < low) {
    return low;
  }
  if (value > high) {
    return high;
  }
  return value;
}
`;
  const commonIndex = buildReferenceIndex([
    { id: "a", repository: "a/a", commit: "1", path: "a.js", language: "javascript", license: "MIT", sourceUrl: "https://a", source: common },
    { id: "b", repository: "b/b", commit: "2", path: "b.js", language: "javascript", license: "MIT", sourceUrl: "https://b", source: common },
    { id: "c", repository: "c/c", commit: "3", path: "c.js", language: "javascript", license: "MIT", sourceUrl: "https://c", source: common },
  ]);
  const { findings } = scanSourceFiles([{ path: "clamp.js", language: "javascript", source: common }], commonIndex);
  assert.ok(findings.some((finding) => finding.classification === "possible_common_pattern"));
  assert.equal(findings.some((finding) => finding.classification === "strong_match"), false);
});

test("source absent from index yields insufficient evidence", () => {
  const unrelated = `
export function triangular(n) {
  let answer = 0;
  for (let i = 1; i <= n; i++) answer += i;
  return answer;
}
`;
  const { findings } = scanSourceFiles([{ path: "unrelated.js", language: "javascript", source: unrelated }], index);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, "insufficient_evidence");
});

test("candidate retrieval is bounded to the configured shortlist", () => {
  const regions = makeRegions(javascriptSource, "queue.js", "javascript");
  const candidates = retrieveCandidates(regions[0], index, { ...index.settings, shortlist: 1 });
  assert.ok(candidates.length <= 1);
});

test("verification reports both customer and source coverage separately", () => {
  const region = makeRegions(javascriptSource, "queue.js", "javascript")[0];
  const candidate = retrieveCandidates(region, index)[0];
  const doc = index.documents.find((item) => item.id === candidate.docId);
  const evidence = verifyCandidate(region, candidate, doc);
  assert.ok(evidence.customerCoverage > 0);
  assert.ok(evidence.sourceCoverage > 0);
  assert.notEqual(evidence.customerLines, null);
  assert.notEqual(evidence.sourceLines, null);
});
