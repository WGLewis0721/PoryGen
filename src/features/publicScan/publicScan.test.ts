import { describe, expect, it } from "vitest";
import { normalizeRepositoryInput } from "./PublicScanPage";

describe("repository input", () => {
  it("accepts the shapes people actually paste", () => {
    const expected = "https://github.com/tiangolo/typer";
    for (const input of [
      "https://github.com/tiangolo/typer",
      "  https://github.com/tiangolo/typer/  ",
      "github.com/tiangolo/typer",
      "tiangolo/typer",
    ]) {
      expect(normalizeRepositoryInput(input)).toBe(expected);
    }
  });

  it("leaves anything else for the scanner to reject with a clear message", () => {
    expect(normalizeRepositoryInput("https://gitlab.com/a/b")).toBe("https://gitlab.com/a/b");
    expect(normalizeRepositoryInput("nonsense")).toBe("nonsense");
    expect(normalizeRepositoryInput("   ")).toBe("");
  });
});
