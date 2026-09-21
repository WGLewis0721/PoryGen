import test from "node:test";
import assert from "node:assert/strict";
import {
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

test("partial fragments can still match without silently truncating them", () => {
  const fragment = `
dequeue() {
  if (this.items.length === 0) {
    return undefined;
  }
  return this.items.shift();
}
`;
  const { findings } = scanSourceFiles([{ path: "fragment.js", language: "javascript", source: fragment }], index);
  assert.ok(findings.length >= 1);
  assert.ok(findings.every((finding) => finding.customer.path === "fragment.js"));
});

test("mixed file can produce evidence from more than one public source", () => {
  const mixed = `${javascriptSource}\n\n${typescriptSource}`;
  const { findings } = scanSourceFiles([{ path: "mixed.ts", language: "typescript", source: mixed }], index);
  assert.ok(findings.some((finding) => finding.publicSource?.path === "business.ts"));
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
