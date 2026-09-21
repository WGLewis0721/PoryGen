// Synced from packages/provenance-core/src/provenance/classifier.ts by
// scripts/sync-vendored-copies.mjs — do not hand-edit; re-run the sync
// script after touching the source. Vendored rather than workspace-imported
// because this package compiles to CommonJS for the VS Code extension host,
// while provenance-core targets ESM/bundler resolution for the Vite app and
// Deno edge functions.

import type { ClassifiedSignal, ClassifierConfig, EditSignal } from "./types";

export function classifyEdit(signal: EditSignal, config: ClassifierConfig): ClassifiedSignal {
  const { insertedChars, insertedLines, elapsedMsSincePrevious, isReplacement } = signal;

  // A large multi-line insertion landing in one change, faster than a human
  // could type it, is the strongest bulk-insertion signal we capture.
  const isBulkBurst =
    insertedLines >= config.bulkInsertMinLines &&
    elapsedMsSincePrevious !== null &&
    elapsedMsSincePrevious <= config.bulkInsertMaxElapsedMs;

  if (isBulkBurst) {
    return isReplacement ? "human_modified_ai" : "ai_assisted_signal";
  }

  // A very large single-shot paste with no timing precedent (first event in a
  // file, or a long gap before it) reads as imported content rather than a
  // tool-assisted generation burst.
  if (
    insertedChars >= config.importedPasteMinChars &&
    (elapsedMsSincePrevious === null || elapsedMsSincePrevious > config.bulkInsertMaxElapsedMs)
  ) {
    return "imported";
  }

  // Ordinary small edits arriving no faster than a human keystroke cadence.
  if (
    insertedChars > 0 &&
    insertedChars <= config.humanMaxCharsPerEvent &&
    (elapsedMsSincePrevious === null || elapsedMsSincePrevious >= config.humanMinElapsedMs)
  ) {
    return isReplacement ? "human_modified_ai" : "human_signal";
  }

  // A mid-size edit that's too fast for typing but doesn't clear the bulk
  // threshold — plausible AI-assisted completion, held with lower confidence.
  if (
    insertedChars > config.humanMaxCharsPerEvent &&
    elapsedMsSincePrevious !== null &&
    elapsedMsSincePrevious < config.humanMinElapsedMs
  ) {
    return "ai_assisted_signal";
  }

  return "unknown";
}

export function summarizeComposition(signals: ClassifiedSignal[]): Record<ClassifiedSignal, number> {
  const counts: Record<ClassifiedSignal, number> = {
    human_signal: 0,
    bulk_insert_signal: 0,
    ai_assisted_signal: 0,
    human_modified_ai: 0,
    imported: 0,
    unknown: 0,
  };
  for (const signal of signals) counts[signal]++;
  return counts;
}
