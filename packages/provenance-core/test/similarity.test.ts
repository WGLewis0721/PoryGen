import { describe, expect, it } from "vitest";
import { lexicalNormalize } from "../src/scanner/lexicalNormalize.js";
import { fingerprintTokens } from "../src/scanner/winnow.js";
import {
  classifySimilarity,
  compareFingerprinted,
  mergeLineRanges,
  SIMILARITY_THRESHOLDS,
} from "../src/scanner/similarity.js";
import { createReferenceCorpusProvider, REFERENCE_CORPUS_PROVIDER_ID } from "../src/scanner/providers/referenceCorpus.js";
import type { ProbeFile } from "../src/scanner/providers/types.js";
import { REFERENCE_CORPUS } from "../src/scanner/corpus.js";

function probeFrom(source: string, path: string, language: ProbeFile["language"]): ProbeFile {
  const tokens = lexicalNormalize(source, language);
  return { path, language, source, tokens, fingerprints: fingerprintTokens(tokens), normalizer: "lexical" };
}

const RENAMED_QUICKSORT = `def order(values):
    if len(values) <= 1:
        return values
    anchor = values[len(values) // 2]
    smaller = [v for v in values if v < anchor]
    equal = [v for v in values if v == anchor]
    larger = [v for v in values if v > anchor]
    return order(smaller) + equal + order(larger)`;

describe("classifySimilarity", () => {
  it("is clear below the reporting threshold", () => {
    expect(classifySimilarity({ containment: SIMILARITY_THRESHOLDS.report - 0.01, licensePolicy: "BLOCKING" })).toBe("clear");
  });

  it("softens a permissive, well-known idiom to a common pattern", () => {
    expect(classifySimilarity({ containment: 0.95, licensePolicy: "CLEAR", commonIdiom: true })).toBe("common_pattern");
  });

  it("never softens a copyleft match, even for an idiom", () => {
    expect(classifySimilarity({ containment: 0.95, licensePolicy: "BLOCKING", commonIdiom: true })).toBe("strong_match");
    expect(classifySimilarity({ containment: 0.6, licensePolicy: "BLOCKING", commonIdiom: true })).toBe("review_suggested");
  });

  it("separates review-suggested from strong matches at the strong threshold", () => {
    expect(classifySimilarity({ containment: SIMILARITY_THRESHOLDS.strong, licensePolicy: "UNKNOWN" })).toBe("strong_match");
    expect(classifySimilarity({ containment: 0.7, licensePolicy: "UNKNOWN" })).toBe("review_suggested");
  });
});

describe("mergeLineRanges", () => {
  it("merges overlapping and adjacent ranges and sorts them", () => {
    expect(mergeLineRanges([{ start: 8, end: 9 }, { start: 1, end: 3 }, { start: 3, end: 5 }, { start: 6, end: 6 }])).toEqual([
      { start: 1, end: 9 },
    ]);
    expect(mergeLineRanges([{ start: 1, end: 2 }, { start: 10, end: 12 }])).toEqual([
      { start: 1, end: 2 },
      { start: 10, end: 12 },
    ]);
  });
});

describe("compareFingerprinted", () => {
  it("reports full containment and line ranges on both sides for a renamed copy", () => {
    const entry = REFERENCE_CORPUS.find((e) => e.id === "ref-quicksort-py")!;
    const candidateTokens = lexicalNormalize(entry.sample, "python");
    const probe = probeFrom(RENAMED_QUICKSORT, "src/sort/order.py", "python");
    const result = compareFingerprinted(probe, { tokens: candidateTokens, fingerprints: fingerprintTokens(candidateTokens) });
    expect(result.containment).toBe(1);
    expect(result.sharedFingerprints).toBe(result.candidateFingerprints);
    expect(result.probeLines[0].start).toBe(1);
    expect(result.probeLines[result.probeLines.length - 1].end).toBe(8);
    expect(result.candidateLines.length).toBeGreaterThan(0);
  });
});

describe("reference corpus provider", () => {
  const provider = createReferenceCorpusProvider();

  it("describes honest, bounded coverage", () => {
    const coverage = provider.describeCoverage();
    expect(coverage.providerId).toBe(REFERENCE_CORPUS_PROVIDER_ID);
    expect(coverage.scope).toBe("bundled-reference");
    expect(coverage.entryCount).toBe(REFERENCE_CORPUS.length);
    expect(coverage.claim).toMatch(/not a search of GitHub/);
    expect(coverage.limitations.length).toBeGreaterThan(0);
  });

  it("discovers candidates through the fingerprint index and compares them precisely", async () => {
    const probe = probeFrom(RENAMED_QUICKSORT, "src/sort/order.py", "python");
    const candidates = await provider.discoverCandidates(probe);
    const quicksort = candidates.find((c) => c.candidateId === "ref-quicksort-py");
    expect(quicksort).toBeDefined();
    expect(quicksort!.origin.kind).toBe("reference-corpus");
    const evidence = await provider.compareCandidate(probe, quicksort!);
    expect(evidence?.containment).toBe(1);
    expect(evidence?.candidateExcerpt).toContain("def quicksort");
  });

  it("finds no candidates for unrelated code", async () => {
    const probe = probeFrom(
      `class Vector3 {\n  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }\n  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }\n}`,
      "src/math/vector.js",
      "javascript",
    );
    const candidates = await provider.discoverCandidates(probe);
    for (const candidate of candidates) {
      const evidence = await provider.compareCandidate(probe, candidate);
      expect(evidence!.containment).toBeLessThan(SIMILARITY_THRESHOLDS.report);
    }
  });

  it("returns nothing for a normalizer it was not configured with", async () => {
    const probe = { ...probeFrom(RENAMED_QUICKSORT, "a.py", "python"), normalizer: "tree-sitter" as const };
    expect(await provider.discoverCandidates(probe)).toEqual([]);
  });
});
