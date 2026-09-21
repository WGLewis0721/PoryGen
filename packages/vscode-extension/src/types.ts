// Synced (subset) from packages/provenance-core/src/types.ts by
// scripts/sync-vendored-copies.mjs — do not hand-edit.

export type ClassifiedSignal =
  | "human_signal"
  | "bulk_insert_signal"
  | "ai_assisted_signal"
  | "human_modified_ai"
  | "imported"
  | "unknown";

export interface ClassifierConfig {
  bulkInsertMinLines: number;
  bulkInsertMaxElapsedMs: number;
  humanMaxCharsPerEvent: number;
  humanMinElapsedMs: number;
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
  elapsedMsSincePrevious: number | null;
  isReplacement: boolean;
}

export type ProvenanceSourceType = "human" | "ai" | "imported" | "generated" | "unknown";
export type ProvenanceActorType = "developer" | "assistant" | "automation" | "external";

export interface CapturedProvenanceEvent {
  filePath: string;
  workspaceRoot: string;
  repository: string | null;
  commitSha: string | null;
  sourceType: ProvenanceSourceType;
  actorType: ProvenanceActorType;
  classifierSignal: ClassifiedSignal;
  insertedChars: number;
  insertedLines: number;
  removedChars: number;
  elapsedMsSincePrevious: number | null;
  timestamp: string;
  contentHash: string;
}
