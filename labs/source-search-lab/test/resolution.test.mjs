import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRescanResolution } from "../public/resolution.mjs";

function finding(path = "src/match.js") {
  return {
    id: `${path}|public/repo|source.js`,
    classification: "strong_match",
    customer: { path },
  };
}

function scan(commit, findings, coverage = {}) {
  return {
    repository: { name: "customer/repo", commit },
    findings,
    scan: {
      checkedFiles: coverage.checkedFiles ?? [],
      supportedFilesInTree: coverage.supportedFilesInTree ?? [],
      treeComplete: coverage.treeComplete ?? false,
      partial: coverage.partial ?? false,
    },
  };
}

test("partial rescan with no findings does not claim an unchecked file was resolved", () => {
  const before = scan("a", [finding()], {
    checkedFiles: ["src/other.js"],
    supportedFilesInTree: ["src/match.js", "src/other.js"],
    treeComplete: true,
  });
  const after = scan("b", [], {
    checkedFiles: ["src/other.js"],
    supportedFilesInTree: ["src/match.js", "src/other.js"],
    treeComplete: true,
    partial: true,
  });

  const result = analyzeRescanResolution(before, after);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.unverified.map((item) => item.customer.path), ["src/match.js"]);
});

test("a finding can resolve when its file was explicitly checked", () => {
  const before = scan("a", [finding()]);
  const after = scan("b", [], {
    checkedFiles: ["src/match.js"],
    supportedFilesInTree: ["src/match.js"],
    treeComplete: true,
  });

  const result = analyzeRescanResolution(before, after);
  assert.deepEqual(result.resolved.map((item) => item.customer.path), ["src/match.js"]);
  assert.deepEqual(result.unverified, []);
});

test("a finding can resolve when a complete tree confirms the file was deleted", () => {
  const before = scan("a", [finding()]);
  const after = scan("b", [], {
    checkedFiles: [],
    supportedFilesInTree: ["src/other.js"],
    treeComplete: true,
  });

  const result = analyzeRescanResolution(before, after);
  assert.deepEqual(result.resolved.map((item) => item.customer.path), ["src/match.js"]);
});
