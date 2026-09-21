import { describe, expect, it } from "vitest";
import { toEvidenceView } from "./evidence";

describe("toEvidenceView", () => {
  it("reads pipeline evidence: provider claim, source origin, excerpts", () => {
    const view = toEvidenceView({
      type: "structural_similarity",
      severity: "blocking",
      confidence: 0.925,
      evidence_json: {
        band: "strong_match",
        containment: 0.925,
        sharedFingerprints: 74,
        candidateFingerprints: 80,
        probeLines: [{ start: 3, end: 41 }],
        candidateLines: [{ start: 1, end: 32 }],
        probeExcerpt: { startLine: 1, text: "code" },
        candidateExcerpt: { startLine: 1, text: "source" },
        provider: { id: "sample-corpus", name: "Sample corpus", claim: "Demo only.", scope: "sample" },
        candidate: { id: "c", title: "SlidingWindow", license: "GPL-3.0", licensePolicy: "BLOCKING", origin: { label: "Fictional", repository: "git.example.org/x" } },
        why: "Because.",
      },
    });
    expect(view.similarity).toMatchObject({ percent: "93%", shared: 74, total: 80 });
    expect(view.source).toMatchObject({ title: "SlidingWindow", license: "GPL-3.0", repository: "git.example.org/x" });
    expect(view.coverage).toMatchObject({ providerName: "Sample corpus", claim: "Demo only.", scope: "sample" });
    expect(view.why).toBe("Because.");
    expect(view.legacy).toBe(false);
  });

  it("recovers reference source and an honest coverage claim for pre-2026.09 rows", () => {
    const view = toEvidenceView({
      type: "structural_similarity",
      severity: "review",
      confidence: 1,
      evidence_json: { corpusEntryId: "ref-quicksort-py", corpusEntryLicense: "AGPL-3.0", containment: 1 },
    });
    expect(view.legacy).toBe(true);
    expect(view.source?.title).toMatch(/quicksort/);
    expect(view.source?.licensePolicy).toBe("BLOCKING");
    expect(view.similarity?.candidateExcerpt?.text).toContain("def quicksort");
    expect(view.similarity?.probeExcerpt).toBeNull();
    expect(view.coverage?.claim).toMatch(/not a search of GitHub/);
  });

  it("describes dependency license findings", () => {
    const view = toEvidenceView({
      type: "license",
      severity: "blocking",
      confidence: null,
      evidence_json: { name: "lattice-forms", version: "2.3.0", ecosystem: "npm", license: "AGPL-3.0", source: "manifest" },
    });
    expect(view.dependency).toMatchObject({ name: "lattice-forms", license: "AGPL-3.0", policy: "BLOCKING" });
  });
});
