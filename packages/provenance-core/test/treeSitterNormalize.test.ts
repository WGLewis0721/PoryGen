import { describe, expect, it } from "vitest";
import { treeSitterNormalize } from "../src/scanner/treeSitterNormalize.js";
import { fingerprintTokens } from "../src/scanner/winnow.js";

describe("treeSitterNormalize (reference implementation, real tree-sitter grammars)", () => {
  it("parses JavaScript into a real AST-shaped token stream", async () => {
    const tokens = await treeSitterNormalize("function add(a, b) { return a + b; }", "javascript");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some((t) => t.kind === "node:function_declaration")).toBe(true);
    expect(tokens.some((t) => t.kind === "ID")).toBe(true);
  });

  it("is invariant to identifier renaming via genuine AST structure, not text", async () => {
    const original = await treeSitterNormalize(
      "function total(items) { let sum = 0; for (const item of items) { sum += item.price; } return sum; }",
      "javascript",
    );
    const renamed = await treeSitterNormalize(
      "function total(list){let acc=0;for(const entry of list){acc+=entry.price;}return acc;}",
      "javascript",
    );
    expect(original.map((t) => t.kind)).toEqual(renamed.map((t) => t.kind));
    expect(fingerprintTokens(original).map((f) => f.hash)).toEqual(
      fingerprintTokens(renamed).map((f) => f.hash),
    );
  });

  it("parses Python with the python grammar", async () => {
    const tokens = await treeSitterNormalize("def greet(name):\n    return name\n", "python");
    expect(tokens.some((t) => t.kind === "node:function_definition")).toBe(true);
  });

  it("distinguishes structurally different code (no false fingerprint match)", async () => {
    const a = await treeSitterNormalize("function add(a, b) { return a + b; }", "javascript");
    const b = await treeSitterNormalize("class Vector { constructor(x) { this.x = x; } }", "javascript");
    expect(fingerprintTokens(a)).not.toEqual(fingerprintTokens(b));
  });
});
