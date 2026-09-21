// Customer-facing words for findings. Similarity is evidence, never an
// accusation: "strong source match", "possible source match", "review
// suggested" — never "copied" or "stolen". Works for rows written before the
// 2026.09 pipeline (no `band` in evidence) by falling back to severity.

import type { FindingSeverity, FindingType, ScanFindingRow, SimilarityBand } from "./dbTypes";

export type Tone = "clear" | "common" | "review" | "strong" | "neutral" | "quiet";

export interface FindingDescriptor {
  label: string;
  tone: Tone;
  band: SimilarityBand | null;
  /** True when a person should look at it (review / strong / license risk). */
  actionable: boolean;
}

export const BAND_LABEL: Record<SimilarityBand | "clear", string> = {
  clear: "Clear",
  common_pattern: "Common pattern",
  review_suggested: "Review suggested",
  strong_match: "Strong source match",
};

const BAND_TONE: Record<SimilarityBand, Tone> = {
  common_pattern: "common",
  review_suggested: "review",
  strong_match: "strong",
};

function readBand(evidence: Record<string, unknown> | null | undefined): SimilarityBand | null {
  const band = evidence?.band;
  return band === "common_pattern" || band === "review_suggested" || band === "strong_match" ? band : null;
}

type FindingLike = Pick<ScanFindingRow, "type" | "severity" | "evidence_json">;

export function describeFinding(finding: FindingLike): FindingDescriptor {
  const evidence = finding.evidence_json ?? {};
  if (finding.type === "structural_similarity") {
    const band = readBand(evidence) ?? legacySimilarityBand(finding.severity);
    return { label: BAND_LABEL[band], tone: BAND_TONE[band], band, actionable: band !== "common_pattern" };
  }
  if (finding.type === "license") {
    const policy = (evidence.licensePolicy as string | undefined) ?? (evidence.license === "Unknown" ? "UNKNOWN" : undefined);
    if (finding.severity === "blocking") return { label: "License conflict", tone: "strong", band: null, actionable: true };
    if (finding.severity === "review") {
      return policy === "UNKNOWN"
        ? { label: "License unknown", tone: "review", band: null, actionable: true }
        : { label: "License review suggested", tone: "review", band: null, actionable: true };
    }
    return { label: "Clear license", tone: "clear", band: null, actionable: false };
  }
  if (finding.type === "provenance_mix") {
    return { label: "Editor attribution note", tone: "common", band: null, actionable: false };
  }
  return finding.severity === "info"
    ? { label: "Note", tone: "quiet", band: null, actionable: false }
    : { label: "Review suggested", tone: "review", band: null, actionable: true };
}

function legacySimilarityBand(severity: FindingSeverity): SimilarityBand {
  if (severity === "blocking") return "strong_match";
  if (severity === "info") return "common_pattern";
  return "review_suggested";
}

export const TYPE_LABEL: Record<FindingType, string> = {
  structural_similarity: "Source similarity",
  license: "License",
  provenance_mix: "Editor attribution",
  policy: "Policy",
};

/** "Strong source match in src/api/rateLimit.ts" — the sentence a finding page leads with. */
export function findingHeadline(finding: FindingLike & Pick<ScanFindingRow, "file_path" | "title">): string {
  const descriptor = describeFinding(finding);
  if (finding.type === "structural_similarity" && finding.file_path) {
    return `${descriptor.label} in ${finding.file_path}`;
  }
  return finding.title;
}

export function percent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
