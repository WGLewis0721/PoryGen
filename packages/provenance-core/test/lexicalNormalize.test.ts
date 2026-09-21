import { describe, expect, it } from "vitest";
import { lexicalNormalize, detectLanguage } from "../src/scanner/lexicalNormalize.js";
import { fingerprintTokens } from "../src/scanner/winnow.js";

describe("lexicalNormalize", () => {
  it("collapses identifiers and literals while preserving keywords and punctuation", () => {
    const tokens = lexicalNormalize('function add(a, b) { return a + b; }', "javascript");
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      "kw:function", "ID", "(", "ID", ",", "ID", ")", "{", "kw:return", "ID", "+", "ID", ";", "}",
    ]);
  });

  it("strips comments entirely", () => {
    const tokens = lexicalNormalize('// a comment\nconst x = 1; /* block */', "javascript");
    expect(tokens.map((t) => t.kind)).toEqual(["kw:const", "ID", "=", "LIT", ";"]);
  });

  it("is invariant to identifier renaming and formatting", () => {
    const original = `function sum(a, b) {\n  return a + b;\n}`;
    const renamed = `function sum(firstValue,secondValue){return firstValue+secondValue;}`;
    const a = lexicalNormalize(original, "javascript");
    const b = lexicalNormalize(renamed, "javascript");
    expect(a.map((t) => t.kind)).toEqual(b.map((t) => t.kind));
  });

  it("produces identical fingerprints for renamed/reformatted structurally-identical code", () => {
    const original = `function total(items) {\n  let sum = 0;\n  for (const item of items) {\n    sum += item.price;\n  }\n  return sum;\n}`;
    const renamed = `function total(list){let acc=0;for(const entry of list){acc+=entry.price;}return acc;}`;
    const fpA = fingerprintTokens(lexicalNormalize(original, "javascript"));
    const fpB = fingerprintTokens(lexicalNormalize(renamed, "javascript"));
    expect(fpA.map((f) => f.hash)).toEqual(fpB.map((f) => f.hash));
  });

  it("detects language from file extension", () => {
    expect(detectLanguage("src/app.tsx")).toBe("typescript");
    expect(detectLanguage("scripts/build.py")).toBe("python");
    expect(detectLanguage("index.js")).toBe("javascript");
    expect(detectLanguage("README.md")).toBe("unknown");
  });

  it("tokenizes python keywords distinctly from identifiers", () => {
    const tokens = lexicalNormalize("def greet(name):\n    return name", "python");
    expect(tokens.map((t) => t.kind)).toEqual(["kw:def", "ID", "(", "ID", ")", ":", "kw:return", "ID"]);
  });
});
