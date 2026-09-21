// Conservative provenance-signal classifier for editor-capture events.
//
// This is heuristic, not detection: it reads shape (size, speed, replacement)
// of a single text-document change, not content, and it is deliberately
// biased toward `unknown` over false confidence. Thresholds are configuration
// (ClassifierConfig), never hidden magic constants — see DEFAULT_CLASSIFIER_CONFIG
// in types.ts. docs/PROVENANCE.md spells out the legal-claim boundary: this
// never asserts "AI wrote this," only "this edit's shape resembles X."

import type { ClassifiedSignal, ClassifierConfig, EditSignal } from "../types.js";

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
