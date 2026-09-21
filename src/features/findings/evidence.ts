// Turns a finding's evidence_json into what the finding page shows. Handles
// three shapes: pipeline 2026.09 rows (band, provider, excerpts), older rows
// (corpusEntryId / containment only), and license rows.

import { REFERENCE_CORPUS, type LineRange } from "@porygen/provenance-core";
import type { ScanFindingRow } from "../../lib/dbTypes";
import { describeFinding, percent, type FindingDescriptor } from "../../lib/findingVocabulary";

export interface ExcerptView {
  startLine: number;
  text: string;
}

export interface SimilarityView {
  percent: string;
  containment: number | null;
  shared: number | null;
  total: number | null;
  probeLines: LineRange[];
  candidateLines: LineRange[];
  probeExcerpt: ExcerptView | null;
  candidateExcerpt: ExcerptView | null;
  normalizer: string | null;
}

export interface SourceView {
  title: string;
  license: string;
  licensePolicy: string;
  originLabel: string;
  repository: string | null;
  path: string | null;
  commonIdiom: boolean;
}

export interface CoverageView {
  providerName: string;
  claim: string;
  scope: string | null;
}

export interface DependencyView {
  name: string;
  ecosystem: string;
  version: string | null;
  license: string;
  policy: string;
  source: string | null;
}

export interface EvidenceView {
  descriptor: FindingDescriptor;
  similarity: SimilarityView | null;
  source: SourceView | null;
  coverage: CoverageView | null;
  dependency: DependencyView | null;
  why: string | null;
  legacy: boolean;
}

const LEGACY_COVERAGE: CoverageView = {
  providerName: "PoryGen reference corpus",
  claim: "Structural fingerprint match against PoryGen's configured reference corpus — not a search of GitHub or the open internet.",
  scope: "bundled-reference",
};

function asRanges(value: unknown): LineRange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is LineRange => typeof r === "object" && r !== null && typeof (r as LineRange).start === "number" && typeof (r as LineRange).end === "number",
  );
}

function asExcerpt(value: unknown): ExcerptView | null {
  if (typeof value !== "object" || value === null) return null;
  const { startLine, text } = value as { startLine?: unknown; text?: unknown };
  return typeof startLine === "number" && typeof text === "string" ? { startLine, text } : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function policyForSpdx(license: string): string {
  if (["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unlicense"].includes(license)) return "CLEAR";
  if (["MPL-2.0", "LGPL-2.1", "LGPL-3.0"].includes(license)) return "REVIEW";
  if (["GPL-2.0", "GPL-3.0", "AGPL-3.0"].includes(license)) return "BLOCKING";
  return "UNKNOWN";
}

export const LICENSE_MEANING: Record<string, string> = {
  CLEAR: "Permissive. Reuse is generally allowed with attribution — keep the original copyright and license notice.",
  REVIEW: "Weak copyleft. Obligations usually attach to the borrowed files themselves; confirm how they apply to the way you distribute.",
  BLOCKING:
    "Strong copyleft. If your code is derived from it and you distribute your product — for AGPL, even run it as a network service — you may have to release your source under the same license.",
  UNKNOWN: "The license couldn't be identified. Check the source's terms before relying on it.",
};

type FindingInput = Pick<ScanFindingRow, "type" | "severity" | "evidence_json" | "confidence">;

export function toEvidenceView(finding: FindingInput): EvidenceView {
  const evidence = finding.evidence_json ?? {};
  const descriptor = describeFinding(finding);

  if (finding.type === "structural_similarity") {
    const candidate = (evidence.candidate ?? null) as Record<string, unknown> | null;
    const provider = (evidence.provider ?? null) as Record<string, unknown> | null;
    const legacy = !candidate;
    const containment = num(evidence.containment) ?? num(finding.confidence);

    let source: SourceView;
    let candidateExcerpt = asExcerpt(evidence.candidateExcerpt);
    if (candidate) {
      const origin = (candidate.origin ?? {}) as Record<string, unknown>;
      const license = str(candidate.license) ?? "Unknown";
      source = {
        title: str(candidate.title) ?? str(candidate.id) ?? "Reference source",
        license,
        licensePolicy: str(candidate.licensePolicy) ?? policyForSpdx(license),
        originLabel: str(origin.label) ?? "Reference source",
        repository: str(origin.repository),
        path: str(origin.path),
        commonIdiom: Boolean(candidate.commonIdiom),
      };
    } else {
      const entryId = str(evidence.corpusEntryId);
      const entry = REFERENCE_CORPUS.find((e) => e.id === entryId);
      const license = str(evidence.corpusEntryLicense) ?? entry?.license ?? "Unknown";
      source = {
        title: entry?.title ?? entryId ?? "Reference corpus entry",
        license,
        licensePolicy: policyForSpdx(license),
        originLabel: "PoryGen reference corpus — original reference implementation",
        repository: null,
        path: entryId,
        commonIdiom: Boolean(entry?.commonIdiom),
      };
      if (!candidateExcerpt && entry) candidateExcerpt = { startLine: 1, text: entry.sample };
    }

    return {
      descriptor,
      legacy,
      similarity: {
        percent: percent(containment),
        containment,
        shared: num(evidence.sharedFingerprints),
        total: num(evidence.candidateFingerprints) ?? num(evidence.corpusFingerprints),
        probeLines: asRanges(evidence.probeLines),
        candidateLines: asRanges(evidence.candidateLines),
        probeExcerpt: asExcerpt(evidence.probeExcerpt),
        candidateExcerpt,
        normalizer: str(evidence.normalizer),
      },
      source,
      coverage: provider
        ? { providerName: str(provider.name) ?? str(provider.id) ?? "Similarity provider", claim: str(provider.claim) ?? LEGACY_COVERAGE.claim, scope: str(provider.scope) }
        : LEGACY_COVERAGE,
      dependency: null,
      why: str(evidence.why),
    };
  }

  if (finding.type === "license") {
    const license = str(evidence.license) ?? str(evidence.detected) ?? "Unknown";
    const name = str(evidence.name);
    return {
      descriptor,
      legacy: false,
      similarity: null,
      source: null,
      coverage: null,
      dependency: name
        ? {
            name,
            ecosystem: str(evidence.ecosystem) ?? "unknown",
            version: str(evidence.version),
            license,
            policy: str(evidence.licensePolicy) ?? policyForSpdx(license),
            source: str(evidence.source),
          }
        : { name: "License file", ecosystem: "file", version: null, license, policy: str(evidence.licensePolicy) ?? policyForSpdx(license), source: null },
      why: null,
    };
  }

  return { descriptor, legacy: false, similarity: null, source: null, coverage: null, dependency: null, why: null };
}

export function formatRanges(ranges: LineRange[]): string {
  if (ranges.length === 0) return "—";
  return ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}–${r.end}`)).join(", ");
}

export function spanOf(ranges: LineRange[]): LineRange | null {
  if (ranges.length === 0) return null;
  return { start: Math.min(...ranges.map((r) => r.start)), end: Math.max(...ranges.map((r) => r.end)) };
}
