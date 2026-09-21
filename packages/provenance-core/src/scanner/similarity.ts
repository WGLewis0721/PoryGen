// Similarity evidence shared by every provider: containment, matched line
// ranges on both sides, and the customer-facing band ("clear", "common
// pattern", "review suggested", "strong source match"). Bands describe how
// strong the *evidence of similarity* is — never a claim that code was copied.

import type { Fingerprint, NormToken, PolicyStatus } from "../types.js";
import type { LineRange, ProbeFile, SimilarityCandidate, SimilarityEvidence, SimilarityProvider } from "./providers/types.js";
import { WINNOW_K } from "./winnow.js";

export type SimilarityBand = "clear" | "common_pattern" | "review_suggested" | "strong_match";

/** Containment at or above `report` becomes a finding; at or above `strong` it is a strong source match. */
export const SIMILARITY_THRESHOLDS = { report: 0.55, strong: 0.85 } as const;

export function classifySimilarity(params: {
  containment: number;
  licensePolicy: PolicyStatus;
  commonIdiom?: boolean;
}): SimilarityBand {
  const { containment, licensePolicy, commonIdiom } = params;
  if (containment < SIMILARITY_THRESHOLDS.report) return "clear";
  if (commonIdiom && licensePolicy === "CLEAR") return "common_pattern";
  if (containment >= SIMILARITY_THRESHOLDS.strong) return "strong_match";
  return "review_suggested";
}

/** Merges ranges that overlap, touch, or are separated by at most `gap` unmatched lines. */
export function mergeLineRanges(ranges: LineRange[], gap = 1): LineRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: LineRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + gap + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Line span covered by the k-gram that starts at token index `position`. */
function kGramLines(tokens: NormToken[], position: number, k: number): LineRange | null {
  const first = tokens[position];
  const last = tokens[Math.min(position + k - 1, tokens.length - 1)];
  if (!first || !last) return null;
  return { start: first.line, end: last.line };
}

/** Line ranges in `tokens` covered by fingerprints whose hash is in `sharedHashes`. */
export function linesForSharedHashes(
  tokens: NormToken[],
  fingerprints: Fingerprint[],
  sharedHashes: Set<number>,
  k: number = WINNOW_K,
): LineRange[] {
  const ranges: LineRange[] = [];
  for (const fp of fingerprints) {
    if (!sharedHashes.has(fp.hash)) continue;
    const span = kGramLines(tokens, fp.position, k);
    if (span) ranges.push(span);
  }
  return mergeLineRanges(ranges);
}

export interface FingerprintedSource {
  tokens: NormToken[];
  fingerprints: Fingerprint[];
}

/** Compares a probe against one fingerprinted candidate; the math every provider shares. */
export function compareFingerprinted(
  probe: FingerprintedSource,
  candidate: FingerprintedSource,
  k: number = WINNOW_K,
): Omit<SimilarityEvidence, "providerId" | "candidateId" | "candidateExcerpt"> {
  const probeHashes = new Set(probe.fingerprints.map((f) => f.hash));
  const candidateHashes = new Set(candidate.fingerprints.map((f) => f.hash));
  const shared = new Set<number>();
  for (const hash of candidateHashes) if (probeHashes.has(hash)) shared.add(hash);
  const containment = candidateHashes.size === 0 ? 0 : shared.size / candidateHashes.size;
  return {
    containment,
    sharedFingerprints: shared.size,
    candidateFingerprints: candidateHashes.size,
    probeFingerprints: probeHashes.size,
    probeLines: linesForSharedHashes(probe.tokens, probe.fingerprints, shared, k),
    candidateLines: linesForSharedHashes(candidate.tokens, candidate.fingerprints, shared, k),
  };
}

export interface ProviderMatch {
  candidate: SimilarityCandidate;
  evidence: SimilarityEvidence;
}

/**
 * Runs a probe through every provider (discover → compare) and returns the
 * comparisons at or above the reporting threshold, strongest first. A provider
 * that throws is skipped and reported, never allowed to fail the whole scan.
 */
export async function findSimilarities(
  probe: ProbeFile,
  providers: SimilarityProvider[],
): Promise<{ matches: ProviderMatch[]; providerErrors: Array<{ providerId: string; message: string }> }> {
  const matches: ProviderMatch[] = [];
  const providerErrors: Array<{ providerId: string; message: string }> = [];
  for (const provider of providers) {
    try {
      const candidates = await provider.discoverCandidates(probe);
      for (const candidate of candidates) {
        const evidence = await provider.compareCandidate(probe, candidate);
        if (evidence && evidence.containment >= SIMILARITY_THRESHOLDS.report) {
          matches.push({ candidate, evidence });
        }
      }
    } catch (err) {
      providerErrors.push({ providerId: provider.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
  matches.sort((a, b) => b.evidence.containment - a.evidence.containment);
  return { matches, providerErrors };
}
