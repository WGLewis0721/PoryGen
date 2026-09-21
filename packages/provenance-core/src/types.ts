// Shared type surface for the PoryGen scanner and provenance engine.
// Consumed by: the Vite app (browser + vitest/Node), Supabase Edge Functions
// (Deno), and the VS Code extension. Kept dependency-free so it loads in all
// three runtimes without a bundler-specific shim.

export type SupportedLanguage = "javascript" | "typescript" | "python" | "unknown";

export interface NormToken {
  /** Token class: keyword text, punctuation text, or a generic class marker. */
  kind: string;
  line: number;
}

export interface Fingerprint {
  /** 32-bit rolling hash of a k-gram, selected by the winnowing window. */
  hash: number;
  /** Index of the k-gram's first token in the normalized token stream. */
  position: number;
}

export interface CorpusEntry {
  id: string;
  title: string;
  license: string;
  /** Precomputed by running normalize+winnow over `sample` at build time. */
  fingerprints: Fingerprint[];
  sample: string;
  language: SupportedLanguage;
  /** A textbook idiom many projects write independently; softens permissive matches to "common pattern". */
  commonIdiom?: boolean;
}

export interface CorpusMatch {
  entryId: string;
  entryTitle: string;
  entryLicense: string;
  /** |probe ∩ corpus| / |corpus|, in [0, 1]. */
  containment: number;
  sharedFingerprints: number;
  corpusFingerprints: number;
}

export type LicenseId =
  | "MIT"
  | "Apache-2.0"
  | "BSD-2-Clause"
  | "BSD-3-Clause"
  | "ISC"
  | "MPL-2.0"
  | "LGPL-2.1"
  | "LGPL-3.0"
  | "GPL-2.0"
  | "GPL-3.0"
  | "AGPL-3.0"
  | "Unlicense"
  | "Unknown";

export type PolicyStatus = "CLEAR" | "REVIEW" | "BLOCKING" | "UNKNOWN";

export interface DependencyLicenseFinding {
  name: string;
  version?: string;
  ecosystem: "npm" | "pypi" | "cargo" | "go" | "unknown";
  license: LicenseId;
  source: "manifest" | "lockfile" | "registry-lookup" | "unresolved";
  policy: PolicyStatus;
}

export interface LicenseFileFinding {
  path: string;
  detected: LicenseId;
}

export type ProvenanceSourceType = "human" | "ai" | "imported" | "generated" | "unknown";
export type ProvenanceActorType = "developer" | "assistant" | "automation" | "external";

export interface ProvenanceEventInput {
  ownerId?: string;
  repositoryId: string;
  filePath: string;
  sourceType: ProvenanceSourceType;
  actorType: ProvenanceActorType;
  provider?: string | null;
  tool?: string | null;
  commitSha?: string | null;
  parentEventId?: string | null;
  contentHash: string;
  diffHash?: string | null;
  eventTimestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceEvent extends ProvenanceEventInput {
  id: string;
  previousEventHash: string | null;
  eventHash: string;
  createdAt: string;
}

export type ClassifiedSignal =
  | "human_signal"
  | "bulk_insert_signal"
  | "ai_assisted_signal"
  | "human_modified_ai"
  | "imported"
  | "unknown";

export interface ClassifierConfig {
  /** A single-event insertion at/above this line count is a bulk-insert candidate. */
  bulkInsertMinLines: number;
  /** ...and it must land within this many ms to count as a single burst. */
  bulkInsertMaxElapsedMs: number;
  /** Below this char count per event, edits read as ordinary human typing. */
  humanMaxCharsPerEvent: number;
  /** Human keystrokes rarely land faster than this; below it reads as programmatic. */
  humanMinElapsedMs: number;
  /** A single paste at/above this char count with no prior context reads as imported. */
  importedPasteMinChars: number;
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  bulkInsertMinLines: 8,
  bulkInsertMaxElapsedMs: 400,
  humanMaxCharsPerEvent: 40,
  humanMinElapsedMs: 150,
  importedPasteMinChars: 400,
};

export interface EditSignal {
  insertedChars: number;
  insertedLines: number;
  removedChars: number;
  /** ms since the previous recorded event in the same file, or null if first event. */
  elapsedMsSincePrevious: number | null;
  /** true when the change replaced an existing non-trivial span rather than appending. */
  isReplacement: boolean;
}
