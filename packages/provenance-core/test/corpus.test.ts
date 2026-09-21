import { describe, expect, it } from "vitest";
import { REFERENCE_CORPUS, matchAgainstCorpus, CORPUS_MATCH_THRESHOLD } from "../src/scanner/corpus.js";
import { lexicalNormalize } from "../src/scanner/lexicalNormalize.js";
import { fingerprintTokens } from "../src/scanner/winnow.js";

describe("reference corpus matching", () => {
  it("has precomputed fingerprints for every entry", () => {
    for (const entry of REFERENCE_CORPUS) {
      expect(entry.fingerprints.length).toBeGreaterThan(0);
    }
  });

  it("flags a renamed/reformatted copy of a corpus entry as a match", () => {
    const original = REFERENCE_CORPUS.find((e) => e.id === "ref-debounce-js")!;
    const renamed = `function wait(callback, delayMs) {
      let handle = null;
      return function (...params) {
        if (handle) clearTimeout(handle);
        handle = setTimeout(() => {
          handle = null;
          callback.apply(this, params);
        }, delayMs);
      };
    }`;
    const tokens = lexicalNormalize(renamed, "javascript");
    const probeFingerprints = fingerprintTokens(tokens);
    const matches = matchAgainstCorpus(probeFingerprints);
    expect(matches.some((m) => m.entryId === original.id)).toBe(true);
    expect(matches[0].containment).toBeGreaterThanOrEqual(CORPUS_MATCH_THRESHOLD);
  });

  it("does not flag unrelated code", () => {
    const unrelated = `class Vector3 {
      constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
      length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    }`;
    const tokens = lexicalNormalize(unrelated, "javascript");
    const matches = matchAgainstCorpus(fingerprintTokens(tokens));
    expect(matches.length).toBe(0);
  });

  it("carries the corpus entry's license so policy evaluation has something to key off", () => {
    const agplEntry = REFERENCE_CORPUS.find((e) => e.id === "ref-quicksort-py");
    expect(agplEntry?.license).toBe("AGPL-3.0");
  });
});
