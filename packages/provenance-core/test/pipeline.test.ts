import { describe, expect, it } from "vitest";
import { runScanPipeline, findingKeys, excerptLines, isCodeFile, type ScanPhase } from "../src/scanner/pipeline.js";
import { createReferenceCorpusProvider, REFERENCE_CORPUS_PROVIDER_ID } from "../src/scanner/providers/referenceCorpus.js";
import { lexicalNormalize } from "../src/scanner/lexicalNormalize.js";
import { treeSitterNormalize } from "../src/scanner/treeSitterNormalize.js";
import type { NormalizeFn } from "../src/scanner/providers/types.js";

const file = (path: string, content: string) => ({ path, content, bytes: new TextEncoder().encode(content).length });

const RENAMED_QUICKSORT = `def order(values):
    if len(values) <= 1:
        return values
    anchor = values[len(values) // 2]
    smaller = [v for v in values if v < anchor]
    equal = [v for v in values if v == anchor]
    larger = [v for v in values if v > anchor]
    return order(smaller) + equal + order(larger)`;

const RENAMED_DEBOUNCE = `export function wait(callback, delayMs) {
  let handle = null;
  return function (...params) {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      callback.apply(this, params);
    }, delayMs);
  };
}`;

const FIXTURE = [
  file("src/sort/order.py", RENAMED_QUICKSORT),
  file("src/utils/wait.js", RENAMED_DEBOUNCE),
  file("src/app.ts", `export const greet = (name: string) => \`hello \${name}\`;\nexport default greet;\n`),
  file("package.json", JSON.stringify({ dependencies: { react: "^19.0.0", "gpl-sample-dependency": "1.0.0" } })),
  file("README.md", "# Fixture\n"),
  file("LICENSE", "MIT License\n\nPermission is hereby granted, free of charge, to any person"),
];

describe("runScanPipeline", () => {
  it("produces keyed, banded findings and an honest summary", async () => {
    const phases: ScanPhase[] = [];
    const result = await runScanPipeline({
      repositoryName: "fixture/repo",
      files: FIXTURE,
      providers: [createReferenceCorpusProvider()],
      onPhase: (phase) => {
        phases.push(phase);
      },
    });

    expect(phases).toEqual(["indexing", "normalizing_ast", "fingerprinting", "analyzing_licenses", "building_provenance_summary"]);

    const strong = result.findings.find((f) => f.file_path === "src/sort/order.py");
    expect(strong).toBeDefined();
    expect(strong!.finding_key).toBe(findingKeys.similarity(REFERENCE_CORPUS_PROVIDER_ID, "ref-quicksort-py", "src/sort/order.py"));
    expect(strong!.evidence_json.band).toBe("strong_match");
    expect(strong!.severity).toBe("blocking"); // AGPL-3.0 reference license
    expect(strong!.line_start).toBe(1);
    expect(strong!.line_end).toBe(8);
    expect((strong!.evidence_json.probeExcerpt as { text: string }).text).toContain("def order(values)");
    expect((strong!.evidence_json.candidateExcerpt as { text: string }).text).toContain("def quicksort(items)");
    expect(String(strong!.evidence_json.why)).toMatch(/structural fingerprints/);
    expect((strong!.evidence_json.provider as { scope: string }).scope).toBe("bundled-reference");

    const idiom = result.findings.find((f) => f.file_path === "src/utils/wait.js");
    expect(idiom?.evidence_json.band).toBe("common_pattern");
    expect(idiom?.severity).toBe("info");

    const gplDependency = result.findings.find((f) => f.finding_key === findingKeys.dependencyLicense("npm", "gpl-sample-dependency"));
    expect(gplDependency?.severity).toBe("blocking");

    expect(result.riskLevel).toBe("blocking");
    expect(result.summary.checkedPaths.sort()).toEqual(["src/app.ts", "src/sort/order.py", "src/utils/wait.js"]);
    expect(result.summary.manifestsChecked).toEqual(["package.json"]);
    expect(result.summary.similarity).toEqual({ clear: 1, commonPattern: 1, reviewSuggested: 0, strongMatch: 1 });
    expect(result.summary.providersRun).toEqual([REFERENCE_CORPUS_PROVIDER_ID]);
    expect(result.summary.coverage[0].claim).toMatch(/not a search of GitHub/);
    expect(result.summary.findingsTruncated).toBe(false);
    expect(result.summary.evaluatedFindingTypes).toEqual(["structural_similarity", "license"]);
  });

  it("is clear when nothing resembles the corpus and licenses are permissive", async () => {
    const result = await runScanPipeline({
      repositoryName: "fixture/clean",
      files: [file("src/app.ts", "export const add = (a: number, b: number) => a + b;\n"), file("package.json", '{"dependencies":{"react":"19"}}')],
      providers: [createReferenceCorpusProvider()],
    });
    expect(result.riskLevel).toBe("clear");
    expect(result.findings.every((f) => f.severity === "info")).toBe(true);
  });

  it("flags truncation instead of silently dropping actionable rows", async () => {
    const result = await runScanPipeline({
      repositoryName: "fixture/repo",
      files: FIXTURE,
      providers: [createReferenceCorpusProvider()],
      limits: { maxActionable: 1 },
    });
    expect(result.summary.findingsTruncated).toBe(true);
  });

  it("runs the same provider seam on the tree-sitter path", async () => {
    const normalize: NormalizeFn = (source, language) =>
      language === "unknown" ? lexicalNormalize(source, language) : treeSitterNormalize(source, language);
    const result = await runScanPipeline({
      repositoryName: "fixture/repo",
      files: [file("src/sort/order.py", RENAMED_QUICKSORT)],
      normalizer: { id: "tree-sitter", normalize },
      providers: [createReferenceCorpusProvider({ normalizers: { "tree-sitter": normalize } })],
    });
    const match = result.findings.find((f) => f.type === "structural_similarity");
    expect(match?.evidence_json.normalizer).toBe("tree-sitter");
    expect(match?.evidence_json.band).toBe("strong_match");
    expect(result.summary.normalizer).toBe("tree-sitter");
  });
});

describe("pipeline helpers", () => {
  it("excerpts the matched region with context and caps", () => {
    const source = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    const excerpt = excerptLines(source, [{ start: 10, end: 12 }], 40, 4000);
    expect(excerpt?.startLine).toBe(8);
    expect(excerpt?.text.split("\n")[0]).toBe("line 8");
    expect(excerpt?.text.split("\n").at(-1)).toBe("line 14");
    expect(excerptLines(source, [{ start: 1, end: 100 }], 5, 4000)?.text.split("\n").length).toBe(5);
    expect(excerptLines(source, [], 40, 4000)).toBeNull();
  });

  it("treats only source files as code", () => {
    expect(isCodeFile("src/a.tsx")).toBe(true);
    expect(isCodeFile("README.md")).toBe(false);
    expect(isCodeFile("package.json")).toBe(false);
    expect(isCodeFile("Makefile")).toBe(false);
  });
});
