import { describe, expect, it } from "vitest";
import { classifyEdit, summarizeComposition } from "../src/classifier";
import { DEFAULT_CLASSIFIER_CONFIG } from "../src/types";

// Exercises the exact classifier the extension host runs, proving
// deterministic classification through fixtures rather than requiring the
// VS Code API (which only exists inside an Extension Development Host).

describe("vscode-extension classifier (vendored copy)", () => {
  it("classifies a 130-line single-change burst as ai_assisted_signal", () => {
    expect(
      classifyEdit(
        { insertedChars: 3200, insertedLines: 130, removedChars: 0, elapsedMsSincePrevious: 184, isReplacement: false },
        DEFAULT_CLASSIFIER_CONFIG,
      ),
    ).toBe("ai_assisted_signal");
  });

  it("classifies human-cadence keystrokes as human_signal", () => {
    expect(
      classifyEdit(
        { insertedChars: 1, insertedLines: 0, removedChars: 0, elapsedMsSincePrevious: 210, isReplacement: false },
        DEFAULT_CLASSIFIER_CONFIG,
      ),
    ).toBe("human_signal");
  });

  it("classifies a large first-paste with no timing precedent as imported", () => {
    expect(
      classifyEdit(
        { insertedChars: 950, insertedLines: 20, removedChars: 0, elapsedMsSincePrevious: null, isReplacement: false },
        DEFAULT_CLASSIFIER_CONFIG,
      ),
    ).toBe("imported");
  });

  it("respects configuration overrides rather than hidden magic constants", () => {
    const strict = { ...DEFAULT_CLASSIFIER_CONFIG, bulkInsertMinLines: 500 };
    expect(
      classifyEdit(
        { insertedChars: 3200, insertedLines: 130, removedChars: 0, elapsedMsSincePrevious: 184, isReplacement: false },
        strict,
      ),
    ).not.toBe("ai_assisted_signal");
  });

  it("summarizes a captured session deterministically", () => {
    const signals = [
      classifyEdit({ insertedChars: 3200, insertedLines: 130, removedChars: 0, elapsedMsSincePrevious: 184, isReplacement: false }, DEFAULT_CLASSIFIER_CONFIG),
      classifyEdit({ insertedChars: 2, insertedLines: 0, removedChars: 0, elapsedMsSincePrevious: 300, isReplacement: false }, DEFAULT_CLASSIFIER_CONFIG),
      classifyEdit({ insertedChars: 2, insertedLines: 0, removedChars: 0, elapsedMsSincePrevious: 300, isReplacement: false }, DEFAULT_CLASSIFIER_CONFIG),
    ];
    expect(summarizeComposition(signals)).toEqual(
      expect.objectContaining({ ai_assisted_signal: 1, human_signal: 2 }),
    );
  });
});
