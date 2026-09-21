import { describe, expect, it } from "vitest";
import { hashKGrams, winnow, fingerprintOverlap, fingerprintTokens } from "../src/scanner/winnow.js";
import type { NormToken } from "../src/types.js";

function tok(...kinds: string[]): NormToken[] {
  return kinds.map((kind, i) => ({ kind, line: i + 1 }));
}

describe("winnowing", () => {
  it("produces one hash per k-gram window", () => {
    const tokens = tok("a", "b", "c", "d", "e", "f", "g");
    const hashes = hashKGrams(tokens, 3);
    expect(hashes.length).toBe(tokens.length - 3 + 1);
  });

  it("is deterministic for identical input", () => {
    const tokens = tok("kw:function", "ID", "(", "ID", ")", "{", "kw:return", "ID", "}");
    const a = winnow(hashKGrams(tokens, 5), 4);
    const b = winnow(hashKGrams(tokens, 5), 4);
    expect(a).toEqual(b);
  });

  it("never selects the same position twice in a row", () => {
    const tokens = tok(..."the quick brown fox jumps over the lazy dog again and again".split(" "));
    const fps = fingerprintTokens(tokens, 4, 3);
    for (let i = 1; i < fps.length; i++) {
      expect(fps[i].position).not.toBe(fps[i - 1].position);
    }
  });

  it("selects the minimum hash within each window", () => {
    const hashes = [9, 2, 7, 1, 8, 3, 6];
    const fps = winnow(hashes, 3);
    // window [9,2,7] -> 2 at pos1; [2,7,1] -> 1 at pos3; [7,1,8]->1 pos3(skip dup);
    // [1,8,3]->1 pos3(skip); [8,3,6]->3 at pos5
    expect(fps.map((f) => f.hash)).toEqual([2, 1, 3]);
    expect(fps.map((f) => f.position)).toEqual([1, 3, 5]);
  });

  it("computes fingerprint overlap between two sets", () => {
    const a = [{ hash: 1, position: 0 }, { hash: 2, position: 1 }, { hash: 3, position: 2 }];
    const b = [{ hash: 2, position: 5 }, { hash: 3, position: 6 }, { hash: 4, position: 7 }];
    expect(fingerprintOverlap(a, b)).toBe(2);
  });

  it("returns no fingerprints for input shorter than k", () => {
    const tokens = tok("a", "b");
    expect(fingerprintTokens(tokens, 5, 4)).toEqual([]);
  });
});
