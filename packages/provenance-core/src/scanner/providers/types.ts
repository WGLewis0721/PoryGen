// The similarity-provider seam. PoryGen's customer workflow (finding →
// inspect → fix → rescan → resolved) must not depend on *which* engine or
// corpus produced a match. Every source of candidate code — the bundled
// reference corpus today; licensed corpora, commercial source intelligence,
// GitHub candidate discovery, or a customer's private corpus later — plugs in
// behind this interface, and every finding records which provider produced it
// and what coverage that provider can honestly claim.

import type { Fingerprint, NormToken, SupportedLanguage } from "../../types.js";

export type NormalizerId = "lexical" | "tree-sitter";

export type NormalizeFn = (source: string, language: SupportedLanguage) => NormToken[] | Promise<NormToken[]>;

export type CoverageScope =
  /** Small corpus bundled with PoryGen itself. */
  | "bundled-reference"
  /** Fictional corpus used only by the public sample demo. */
  | "sample"
  /** Planned: larger licensed source corpora. */
  | "licensed-corpus"
  /** Planned: commercial source intelligence (e.g. SCANOSS-class services). */
  | "commercial-intel"
  /** Planned: candidate discovery against public GitHub repositories. */
  | "github-discovery"
  /** Planned: an organization's own private/internal corpus. */
  | "private-corpus";

export interface ProviderCoverage {
  providerId: string;
  providerName: string;
  corpusName: string;
  corpusVersion: string;
  scope: CoverageScope;
  entryCount: number;
  languages: SupportedLanguage[];
  /** One sentence a customer can read on every finding, with no overstatement. */
  claim: string;
  /** What this provider does not cover. Rendered wherever coverage is shown. */
  limitations: string[];
}

export interface ProbeFile {
  path: string;
  language: SupportedLanguage;
  source: string;
  tokens: NormToken[];
  fingerprints: Fingerprint[];
  normalizer: NormalizerId;
}

export interface CandidateOrigin {
  kind: "reference-corpus" | "sample" | "repository" | "package";
  /** Human-readable description of where the candidate comes from. */
  label: string;
  repository?: string | null;
  path?: string | null;
  url?: string | null;
}

export interface SimilarityCandidate {
  providerId: string;
  candidateId: string;
  title: string;
  /** SPDX identifier (or "Unknown") of the candidate's license. */
  license: string;
  language: SupportedLanguage;
  origin: CandidateOrigin;
  /** A widely re-implemented idiom (debounce, deep clone...). Softens a permissive match to "common pattern". */
  commonIdiom?: boolean;
}

export interface LineRange {
  start: number;
  end: number;
}

export interface SimilarityEvidence {
  providerId: string;
  candidateId: string;
  /** |probe ∩ candidate| / |candidate| over winnowed fingerprint hashes, in [0, 1]. */
  containment: number;
  sharedFingerprints: number;
  candidateFingerprints: number;
  probeFingerprints: number;
  /** Merged line ranges in the scanned file covered by shared fingerprints. */
  probeLines: LineRange[];
  /** Merged line ranges in the candidate covered by shared fingerprints. */
  candidateLines: LineRange[];
  /** Candidate source for side-by-side display — only when the provider may redistribute it. */
  candidateExcerpt: string | null;
}

export interface SimilarityProvider {
  readonly id: string;
  describeCoverage(): ProviderCoverage;
  /** Cheap first stage: which candidates are worth a precise comparison? */
  discoverCandidates(probe: ProbeFile): Promise<SimilarityCandidate[]>;
  /** Precise second stage. Returns null when the provider can't compare this probe (e.g. normalizer mismatch). */
  compareCandidate(probe: ProbeFile, candidate: SimilarityCandidate): Promise<SimilarityEvidence | null>;
}
