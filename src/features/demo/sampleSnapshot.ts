// The homepage shows the demo's headline finding without shipping the scanner
// to every visitor. These numbers are the real engine's output for the sample
// files; sampleEngine.test.ts fails if they ever drift from it.

import type { LineRange } from "@porygen/provenance-core";

export const SAMPLE_MATCH_SNAPSHOT = {
  path: "src/api/rateLimit.ts",
  band: "strong_match" as const,
  containment: 0.925,
  /** Similarity of the replacement (commit b81e0d4) to the same source — below the 55% reporting threshold. */
  afterContainment: 0.0625,
  sharedFingerprints: 74,
  candidateFingerprints: 80,
  probeLines: [
    { start: 3, end: 5 },
    { start: 8, end: 11 },
    { start: 14, end: 34 },
    { start: 39, end: 41 },
  ] satisfies LineRange[],
  candidateLines: [
    { start: 1, end: 3 },
    { start: 6, end: 9 },
    { start: 12, end: 32 },
  ] satisfies LineRange[],
  license: "GPL-3.0",
  candidateId: "sample-slidewindow",
  candidateTitle: "SlidingWindow rate limiter",
  sourceRepository: "git.example.org/sample-oss/slidewindow",
  sourcePath: "src/window.ts",
};
