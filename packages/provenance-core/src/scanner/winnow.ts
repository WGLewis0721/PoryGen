// Winnowing fingerprint selection (Schleimer, Wilkerson & Aiken, 2003) over a
// normalized token stream. This is the real algorithm, not a stand-in:
// k contiguous tokens are hashed into a rolling k-gram hash, then for every
// window of w consecutive k-gram hashes the minimum is retained (rightmost on
// ties), guaranteeing every substring of length >= k + w - 1 has at least one
// fingerprint selected — the winnowing "guarantee threshold."

import type { Fingerprint, NormToken } from "../types.js";

/** k-gram size: how many normalized tokens make up one hashed unit. */
export const WINNOW_K = 5;
/** window size: how many consecutive k-gram hashes compete per selection. */
export const WINNOW_W = 4;

/** FNV-1a 32-bit hash — fast, deterministic, adequate for fingerprint selection. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashKGrams(tokens: NormToken[], k: number = WINNOW_K): number[] {
  if (tokens.length < k) return [];
  const hashes: number[] = new Array(tokens.length - k + 1);
  for (let i = 0; i <= tokens.length - k; i++) {
    let gram = "";
    for (let j = 0; j < k; j++) gram += tokens[i + j].kind + "";
    hashes[i] = fnv1a(gram);
  }
  return hashes;
}

/**
 * Selects the winnowing fingerprint set from a k-gram hash sequence.
 * Standard algorithm: slide a window of size w over the hashes; in each
 * window keep the position of the minimum hash, preferring the rightmost
 * occurrence on ties, and skip re-emitting the same position consecutively.
 */
export function winnow(hashes: number[], w: number = WINNOW_W): Fingerprint[] {
  if (hashes.length === 0) return [];
  if (hashes.length <= w) {
    let minPos = 0;
    for (let i = 1; i < hashes.length; i++) if (hashes[i] <= hashes[minPos]) minPos = i;
    return [{ hash: hashes[minPos], position: minPos }];
  }

  const fingerprints: Fingerprint[] = [];
  let lastSelected = -1;

  for (let start = 0; start <= hashes.length - w; start++) {
    let minPos = start;
    for (let i = start + 1; i < start + w; i++) {
      if (hashes[i] <= hashes[minPos]) minPos = i;
    }
    if (minPos !== lastSelected) {
      fingerprints.push({ hash: hashes[minPos], position: minPos });
      lastSelected = minPos;
    }
  }
  return fingerprints;
}

/** Convenience: normalize-already-tokenized source straight to a fingerprint set. */
export function fingerprintTokens(tokens: NormToken[], k = WINNOW_K, w = WINNOW_W): Fingerprint[] {
  return winnow(hashKGrams(tokens, k), w);
}

/** |a ∩ b| by hash value (position is ignored for cross-file comparison). */
export function fingerprintOverlap(a: Fingerprint[], b: Fingerprint[]): number {
  const bHashes = new Set(b.map((f) => f.hash));
  let shared = 0;
  const seen = new Set<number>();
  for (const f of a) {
    if (bHashes.has(f.hash) && !seen.has(f.hash)) {
      shared++;
      seen.add(f.hash);
    }
  }
  return shared;
}
