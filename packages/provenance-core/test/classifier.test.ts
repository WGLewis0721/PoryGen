import { describe, expect, it } from "vitest";
import { classifyEdit, summarizeComposition } from "../src/provenance/classifier.js";
import { DEFAULT_CLASSIFIER_CONFIG } from "../src/types.js";

describe("classifyEdit", () => {
  it("classifies a 130-line single-change burst as ai_assisted_signal", () => {
    const result = classifyEdit(
      { insertedChars: 3200, insertedLines: 130, removedChars: 0, elapsedMsSincePrevious: 184, isReplacement: false },
      DEFAULT_CLASSIFIER_CONFIG,
    );
    expect(result).toBe("ai_assisted_signal");
  });

  it("classifies continuous short edits at human cadence as human_signal", () => {
    const result = classifyEdit(
      { insertedChars: 3, insertedLines: 0, removedChars: 0, elapsedMsSincePrevious: 220, isReplacement: false },
      DEFAULT_CLASSIFIER_CONFIG,
    );
    expect(result).toBe("human_signal");
  });

  it("classifies a bulk burst that replaces existing text as human_modified_ai", () => {
    const result = classifyEdit(
      { insertedChars: 2000, insertedLines: 40, removedChars: 1800, elapsedMsSincePrevious: 90, isReplacement: true },
      DEFAULT_CLASSIFIER_CONFIG,
    );
    expect(result).toBe("human_modified_ai");
  });

  it("classifies a large first-event paste with no timing precedent as imported", () => {
    const result = classifyEdit(
      { insertedChars: 900, insertedLines: 25, removedChars: 0, elapsedMsSincePrevious: null, isReplacement: false },
      DEFAULT_CLASSIFIER_CONFIG,
    );
    expect(result).toBe("imported");
  });

  it("falls back to unknown for ambiguous shapes", () => {
    const result = classifyEdit(
      { insertedChars: 0, insertedLines: 0, removedChars: 5, elapsedMsSincePrevious: 500, isReplacement: true },
      DEFAULT_CLASSIFIER_CONFIG,
    );
    expect(result).toBe("unknown");
  });

  it("summarizes a batch of classifications into counts", () => {
    const counts = summarizeComposition(["human_signal", "human_signal", "ai_assisted_signal", "unknown"]);
    expect(counts.human_signal).toBe(2);
    expect(counts.ai_assisted_signal).toBe(1);
    expect(counts.unknown).toBe(1);
    expect(counts.imported).toBe(0);
  });
});
