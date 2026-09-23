import type { ScanResult } from "./types";

export function reportFixture(): ScanResult {
  return {
    repository: { name: "owner/project", url: "https://github.com/owner/project", commit: "abc123", commitUrl: "https://github.com/owner/project/commit/abc123", defaultBranch: "main" },
    coverage: { claim: "This lab searches a fixed index." },
    scan: { elapsedMs: 150, fetchedFiles: 1, fetchedBytes: 300, partial: false, checkedFiles: ["src/app.ts"], supportedFilesInTree: ["src/app.ts"], treeComplete: true, skippedCount: 0, incompleteSupportedFiles: 0, incompleteReasons: {}, exclusions: ["src/starter"], excludedFiles: 2 },
    summary: { strong: 1, possible: 0, insufficient: 0, total: 1 },
    findings: [{ id: "match1", classification: "strong_match", customer: { path: "src/app.ts", lines: { start: 5, end: 12 }, excerpt: "function example() {}" }, publicSource: { repository: "owner/source", path: "index.ts", commit: "deadbeef", url: "https://github.com/owner/source/blob/deadbeef/index.ts", lines: { start: 8, end: 15 }, excerpt: "function example() {}", license: "MIT", licenseUrl: "https://github.com/owner/source/blob/deadbeef/LICENSE" }, explanation: "Specific sequence matched." }],
    disclaimer: "Similarity is evidence to review.",
  };
}
