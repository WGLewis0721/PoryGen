import { describe, expect, it } from "vitest";
import { BAND_LABEL, describeFinding, findingHeadline } from "./findingVocabulary";

describe("finding vocabulary", () => {
  it("labels similarity by band, never as copying", () => {
    expect(describeFinding({ type: "structural_similarity", severity: "blocking", evidence_json: { band: "strong_match" } })).toMatchObject({
      label: "Strong source match",
      tone: "strong",
      actionable: true,
    });
    expect(describeFinding({ type: "structural_similarity", severity: "info", evidence_json: { band: "common_pattern" } }).actionable).toBe(false);
    for (const label of Object.values(BAND_LABEL)) expect(label).not.toMatch(/cop(y|ied)|stole|plagiar|infring/i);
  });

  it("falls back to severity for rows written before bands existed", () => {
    expect(describeFinding({ type: "structural_similarity", severity: "review", evidence_json: {} }).label).toBe("Review suggested");
  });

  it("describes license findings by policy", () => {
    expect(describeFinding({ type: "license", severity: "blocking", evidence_json: { license: "AGPL-3.0" } }).label).toBe("License conflict");
    expect(describeFinding({ type: "license", severity: "review", evidence_json: { license: "Unknown", licensePolicy: "UNKNOWN" } }).label).toBe("License unknown");
    expect(describeFinding({ type: "license", severity: "info", evidence_json: { license: "MIT" } }).actionable).toBe(false);
  });

  it("keeps editor attribution informational", () => {
    expect(describeFinding({ type: "provenance_mix", severity: "review", evidence_json: {} }).actionable).toBe(false);
  });

  it("leads with what and where", () => {
    expect(
      findingHeadline({ type: "structural_similarity", severity: "blocking", evidence_json: { band: "strong_match" }, file_path: "src/a.ts", title: "x" }),
    ).toBe("Strong source match in src/a.ts");
  });
});
