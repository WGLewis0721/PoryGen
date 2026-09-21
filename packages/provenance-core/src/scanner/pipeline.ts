// The portable scan pipeline. Runtime-agnostic (browser, Node, Deno): it takes
// already-ingested files plus a set of similarity providers and returns
// finding drafts, a summary, and a risk level. Ingestion (GitHub, a local
// directory, a CI checkout) and persistence (Supabase, a JSON file) stay with
// the caller, so the same pipeline runs in the Edge Function today and in a
// worker, CI job, or customer-controlled environment later without changing
// the customer workflow.

import { sha256Hex, shortHash } from "../fingerprint.js";
import { buildCycloneDxSbom } from "../sbom.js";
import type { DependencyLicenseFinding, LicenseFileFinding, PolicyStatus } from "../types.js";
import {
  DEPENDENCY_MANIFEST_FILES,
  evaluateDependencyLicenses,
  policyForLicense,
  scanLicenseFiles,
  staticLicenseLookup,
  summarizePolicy,
  type LicenseLookup,
} from "./license.js";
import { detectLanguage, lexicalNormalize } from "./lexicalNormalize.js";
import type { LineRange, NormalizeFn, NormalizerId, ProbeFile, ProviderCoverage, SimilarityProvider } from "./providers/types.js";
import { classifySimilarity, findSimilarities, type ProviderMatch, type SimilarityBand } from "./similarity.js";
import { fingerprintTokens } from "./winnow.js";

export const PIPELINE_VERSION = "2026.09";

export type FindingType = "license" | "structural_similarity" | "provenance_mix" | "policy";
export type FindingSeverity = "info" | "review" | "blocking";
export type RiskLevel = "clear" | "review" | "blocking" | "unknown";

/** Scan statuses the pipeline reports while it works (a subset of `scans.status`). */
export type ScanPhase = "indexing" | "normalizing_ast" | "fingerprinting" | "analyzing_licenses" | "building_provenance_summary";

export interface ScanSourceFile {
  path: string;
  content: string;
  bytes: number;
}

/** One row for `scan_findings`, minus `scan_id`. */
export interface FindingDraft {
  finding_key: string;
  type: FindingType;
  severity: FindingSeverity;
  title: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  confidence: number | null;
  evidence_json: Record<string, unknown>;
  remediation: string | null;
}

export interface CodeExcerpt {
  startLine: number;
  text: string;
}

export interface SimilarityCounts {
  clear: number;
  commonPattern: number;
  reviewSuggested: number;
  strongMatch: number;
}

export interface ScanSummary {
  pipelineVersion: string;
  normalizer: NormalizerId;
  languages: string[];
  referenceFingerprintsChecked: number;
  clearFindings: number;
  reviewFindings: number;
  blockingFindings: number;
  terminalLog: string[];
  coverage: ProviderCoverage[];
  providersRun: string[];
  providerErrors: Array<{ providerId: string; message: string }>;
  /** Code files that went through similarity comparison — the rescan contract for resolving file findings. */
  checkedPaths: string[];
  /** Every file the scan received (code, manifests, license files). */
  ingestedPaths: string[];
  /** Dependency manifests that were evaluated — the rescan contract for resolving dependency findings. */
  manifestsChecked: string[];
  evaluatedFindingTypes: FindingType[];
  /** True when finding caps dropped rows; reconciliation must not auto-resolve from a truncated scan. */
  findingsTruncated: boolean;
  /** Per-file similarity outcome (each checked code file counted once, by its strongest band). */
  similarity: SimilarityCounts;
  repoContentHash: string;
  sbom: unknown;
  /** Retained for older readers; editor attribution lives in provenance_events, not scans. */
  provenanceCoveragePercent: number;
  provenanceComposition: { human: number; ai: number; humanModifiedAi: number; unknown: number };
}

export interface PipelineResult {
  findings: FindingDraft[];
  summary: ScanSummary;
  riskLevel: RiskLevel;
  dependencyFindings: DependencyLicenseFinding[];
  licenseFileFindings: LicenseFileFinding[];
}

export interface PipelineLimits {
  /** Cap on persisted informational rows (clear licenses, common patterns). Actionable rows are never capped below `maxActionable`. */
  maxInformational: number;
  maxActionable: number;
  excerptMaxLines: number;
  excerptMaxChars: number;
}

export const DEFAULT_PIPELINE_LIMITS: PipelineLimits = {
  maxInformational: 40,
  maxActionable: 200,
  excerptMaxLines: 40,
  excerptMaxChars: 4000,
};

export interface PipelineInput {
  repositoryName: string;
  files: ScanSourceFile[];
  providers: SimilarityProvider[];
  normalizer?: { id: NormalizerId; normalize: NormalizeFn };
  licenseLookup?: LicenseLookup;
  onPhase?: (phase: ScanPhase, patch: Record<string, unknown>) => unknown | Promise<unknown>;
  terminalLog?: string[];
  limits?: Partial<PipelineLimits>;
}

/** Bounds summary_json size. Paths beyond the cap simply aren't eligible for auto-resolution. */
const MAX_RECORDED_PATHS = 5000;

const CODE_EXTENSIONS = new Set([
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".py", ".go", ".rs", ".rb",
  ".java", ".c", ".h", ".cpp", ".cc", ".cs", ".php", ".swift", ".kt",
]);

export function isCodeFile(path: string): boolean {
  const idx = path.lastIndexOf(".");
  return idx !== -1 && CODE_EXTENSIONS.has(path.slice(idx).toLowerCase());
}

/** Stable identities that let a finding be recognised again in later scans of the same repository. */
export const findingKeys = {
  similarity: (providerId: string, candidateId: string, filePath: string) => `similarity:${providerId}:${candidateId}:${filePath}`,
  dependencyLicense: (ecosystem: string, name: string) => `license:dependency:${ecosystem}:${name}`,
  licenseFile: (path: string) => `license:file:${path}`,
  provenance: (filePath: string) => `provenance:${filePath}`,
};

const BAND_RANK: Record<SimilarityBand, number> = { clear: 0, common_pattern: 1, review_suggested: 2, strong_match: 3 };

const LICENSE_CONTEXT: Record<PolicyStatus, string> = {
  CLEAR: "a permissive license — usually attribution only",
  REVIEW: "a weak-copyleft license — obligations depend on how you distribute",
  BLOCKING: "a strong-copyleft license — derived code may have to be released under the same terms",
  UNKNOWN: "an unrecognised license — terms need checking",
};

export function excerptLines(source: string, ranges: LineRange[], maxLines: number, maxChars: number, context = 2): CodeExcerpt | null {
  if (ranges.length === 0) return null;
  const lines = source.split("\n");
  const first = Math.max(1, ranges[0].start - context);
  const last = Math.min(lines.length, Math.max(...ranges.map((r) => r.end)) + context, first + maxLines - 1);
  let text = lines.slice(first - 1, last).join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return { startLine: first, text };
}

function similarityTitle(band: SimilarityBand, candidateTitle: string): string {
  if (band === "strong_match") return `Strong source match: ${candidateTitle}`;
  if (band === "common_pattern") return `Common pattern: ${candidateTitle}`;
  return `Possible source match: ${candidateTitle}`;
}

function similaritySeverity(band: SimilarityBand, licensePolicy: PolicyStatus): FindingSeverity {
  if (band === "common_pattern" || band === "clear") return "info";
  if (band === "strong_match" && licensePolicy === "BLOCKING") return "blocking";
  return "review";
}

function similarityRemediation(band: SimilarityBand): string | null {
  if (band === "strong_match") {
    return "Compare the highlighted region with the possible source. If it was derived from it, replace or rewrite it and rescan — or keep it, meet the license terms, and accept the risk with a reason.";
  }
  if (band === "review_suggested") {
    return "Look at the highlighted region. If it is independent work, dismiss it as a false positive with a note; otherwise replace or rewrite it and rescan.";
  }
  return null;
}

function formatRanges(ranges: LineRange[]): string {
  return ranges.map((r) => (r.start === r.end ? `line ${r.start}` : `lines ${r.start}–${r.end}`)).join(", ");
}

function similarityWhy(match: ProviderMatch, licensePolicy: PolicyStatus): string {
  const { evidence, candidate } = match;
  const pct = Math.round(evidence.containment * 100);
  const where = evidence.probeLines.length ? ` (${formatRanges(evidence.probeLines)})` : "";
  return (
    `${pct}% of the possible source's structural fingerprints — ${evidence.sharedFingerprints} of ${evidence.candidateFingerprints} — ` +
    `appear in this file${where} after names, literals, comments, and formatting were normalized away. ` +
    `The possible source carries ${candidate.license}: ${LICENSE_CONTEXT[licensePolicy]}.`
  );
}

function combineRisk(licensePolicy: PolicyStatus, similarityFindings: FindingDraft[]): RiskLevel {
  if (licensePolicy === "BLOCKING" || similarityFindings.some((f) => f.severity === "blocking")) return "blocking";
  if (licensePolicy === "REVIEW" || similarityFindings.some((f) => f.severity === "review")) return "review";
  if (licensePolicy === "UNKNOWN") return "unknown";
  return "clear";
}

export async function runScanPipeline(input: PipelineInput): Promise<PipelineResult> {
  const limits = { ...DEFAULT_PIPELINE_LIMITS, ...input.limits };
  const normalizer = input.normalizer ?? { id: "lexical" as NormalizerId, normalize: lexicalNormalize };
  const licenseLookup = input.licenseLookup ?? staticLicenseLookup;
  const terminalLog = input.terminalLog ?? [];
  const phase = async (name: ScanPhase, patch: Record<string, unknown> = {}) => {
    if (input.onPhase) await input.onPhase(name, patch);
  };
  const files = input.files;

  // ---- index -------------------------------------------------------------
  await phase("indexing");
  const codeFiles = files.filter((f) => isCodeFile(f.path));
  const totalLoc = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
  terminalLog.push(`[index] ${files.length} files · ${codeFiles.length} code files · ${totalLoc.toLocaleString("en-US")} LOC`);

  // ---- normalize -----------------------------------------------------------
  await phase("normalizing_ast", { files_scanned: files.length });
  let totalTokens = 0;
  const probes: ProbeFile[] = [];
  for (const file of codeFiles) {
    const language = detectLanguage(file.path);
    const tokens = await normalizer.normalize(file.content, language);
    totalTokens += tokens.length;
    probes.push({ path: file.path, language, source: file.content, tokens, fingerprints: [], normalizer: normalizer.id });
  }
  terminalLog.push(`[normalize] ${totalTokens.toLocaleString("en-US")} tokens normalized (${normalizer.id})`);

  // ---- fingerprint + compare ----------------------------------------------
  await phase("fingerprinting");
  let totalFingerprints = 0;
  const providerErrors: Array<{ providerId: string; message: string }> = [];
  const coverage = input.providers.map((p) => p.describeCoverage());
  const similarityDrafts: FindingDraft[] = [];
  const counts: SimilarityCounts = { clear: 0, commonPattern: 0, reviewSuggested: 0, strongMatch: 0 };
  const coverageById = new Map(coverage.map((c) => [c.providerId, c]));

  for (const probe of probes) {
    probe.fingerprints = fingerprintTokens(probe.tokens);
    totalFingerprints += probe.fingerprints.length;
    let strongest: SimilarityBand = "clear";
    if (probe.fingerprints.length > 0) {
      const { matches, providerErrors: errors } = await findSimilarities(probe, input.providers);
      providerErrors.push(...errors);
      for (const match of matches) {
        const licensePolicy = policyForLicense(match.candidate.license as Parameters<typeof policyForLicense>[0]);
        const band = classifySimilarity({
          containment: match.evidence.containment,
          licensePolicy,
          commonIdiom: match.candidate.commonIdiom,
        });
        if (BAND_RANK[band] > BAND_RANK[strongest]) strongest = band;
        const providerCoverage = coverageById.get(match.evidence.providerId);
        const firstLine = match.evidence.probeLines[0]?.start ?? null;
        const lastLine = match.evidence.probeLines.length ? match.evidence.probeLines[match.evidence.probeLines.length - 1].end : null;
        similarityDrafts.push({
          finding_key: findingKeys.similarity(match.evidence.providerId, match.candidate.candidateId, probe.path),
          type: "structural_similarity",
          severity: similaritySeverity(band, licensePolicy),
          title: similarityTitle(band, match.candidate.title),
          file_path: probe.path,
          line_start: firstLine,
          line_end: lastLine,
          confidence: Number(match.evidence.containment.toFixed(3)),
          evidence_json: {
            band,
            why: similarityWhy(match, licensePolicy),
            provider: providerCoverage
              ? {
                  id: providerCoverage.providerId,
                  name: providerCoverage.providerName,
                  corpus: providerCoverage.corpusName,
                  corpusVersion: providerCoverage.corpusVersion,
                  scope: providerCoverage.scope,
                  claim: providerCoverage.claim,
                }
              : { id: match.evidence.providerId },
            candidate: {
              id: match.candidate.candidateId,
              title: match.candidate.title,
              license: match.candidate.license,
              licensePolicy,
              origin: match.candidate.origin,
              commonIdiom: Boolean(match.candidate.commonIdiom),
            },
            containment: match.evidence.containment,
            sharedFingerprints: match.evidence.sharedFingerprints,
            candidateFingerprints: match.evidence.candidateFingerprints,
            probeFingerprints: match.evidence.probeFingerprints,
            probeLines: match.evidence.probeLines,
            candidateLines: match.evidence.candidateLines,
            probeExcerpt: excerptLines(probe.source, match.evidence.probeLines, limits.excerptMaxLines, limits.excerptMaxChars),
            candidateExcerpt: match.evidence.candidateExcerpt
              ? { startLine: 1, text: match.evidence.candidateExcerpt.slice(0, limits.excerptMaxChars) }
              : null,
            normalizer: normalizer.id,
            // Older readers (evidence export, pre-2026.09 UI) key off these.
            corpusEntryId: match.candidate.candidateId,
            corpusEntryLicense: match.candidate.license,
            note: providerCoverage?.claim ?? "Structural fingerprint match against configured reference corpus.",
          },
          remediation: similarityRemediation(band),
        });
      }
    }
    if (strongest === "strong_match") counts.strongMatch++;
    else if (strongest === "review_suggested") counts.reviewSuggested++;
    else if (strongest === "common_pattern") counts.commonPattern++;
    else counts.clear++;
  }
  const flaggedFiles = counts.strongMatch + counts.reviewSuggested;
  terminalLog.push(`[fingerprint] ${totalFingerprints.toLocaleString("en-US")} fingerprints retained`);
  for (const c of coverage) {
    terminalLog.push(`[compare] ${c.providerName} v${c.corpusVersion} — ${c.entryCount} references`);
  }
  terminalLog.push(
    `[compare] ${probes.length} code files · ${counts.clear} clear · ${counts.commonPattern} common pattern · ${counts.reviewSuggested} review suggested · ${counts.strongMatch} strong match`,
  );
  for (const err of providerErrors) terminalLog.push(`[compare] provider ${err.providerId} skipped: ${err.message}`);

  // ---- licenses ------------------------------------------------------------
  await phase("analyzing_licenses");
  const fileMap: Record<string, string> = {};
  for (const f of files) fileMap[f.path] = f.content;
  // Manifests are looked up by basename, so root and nested manifests both count.
  for (const f of files) {
    const base = f.path.split("/").pop()!;
    if (!(base in fileMap)) fileMap[base] = f.content;
  }
  const manifestsChecked = files
    .map((f) => f.path)
    .filter((path) => DEPENDENCY_MANIFEST_FILES.includes(path.split("/").pop() ?? path));
  const licenseFileFindings = scanLicenseFiles(Object.fromEntries(files.map((f) => [f.path, f.content])));
  const dependencyFindings = await evaluateDependencyLicenses(fileMap, licenseLookup);
  const licensePolicy = summarizePolicy(licenseFileFindings, dependencyFindings);
  const blockingDependency = dependencyFindings.find((d) => d.policy === "BLOCKING");
  terminalLog.push(
    blockingDependency
      ? `[license] ${blockingDependency.license} dependency found: ${blockingDependency.name}`
      : `[license] ${dependencyFindings.length} dependencies evaluated`,
  );

  // ---- findings ----------------------------------------------------------------
  await phase("building_provenance_summary", { dependencies_scanned: dependencyFindings.length });
  const licenseDrafts: FindingDraft[] = [];
  for (const finding of licenseFileFindings) {
    const policy = policyForLicense(finding.detected);
    licenseDrafts.push({
      finding_key: findingKeys.licenseFile(finding.path),
      type: "license",
      severity: policy === "BLOCKING" ? "blocking" : policy === "CLEAR" ? "info" : "review",
      title: `${finding.detected} license file detected`,
      file_path: finding.path,
      line_start: null,
      line_end: null,
      confidence: null,
      evidence_json: { detected: finding.detected, licensePolicy: policy },
      remediation: policy === "CLEAR" ? null : "Review these license terms against how you distribute your product.",
    });
  }
  for (const dep of dependencyFindings) {
    licenseDrafts.push({
      finding_key: findingKeys.dependencyLicense(dep.ecosystem, dep.name),
      type: "license",
      severity: dep.policy === "BLOCKING" ? "blocking" : dep.policy === "CLEAR" ? "info" : "review",
      title: `${dep.ecosystem} dependency "${dep.name}" — ${dep.license}`,
      file_path: null,
      line_start: null,
      line_end: null,
      confidence: null,
      evidence_json: {
        name: dep.name,
        version: dep.version ?? null,
        ecosystem: dep.ecosystem,
        license: dep.license,
        licensePolicy: dep.policy,
        source: dep.source,
      },
      remediation:
        dep.policy === "BLOCKING"
          ? `${dep.license} carries strong copyleft obligations under the default commercial policy — review before you distribute.`
          : dep.policy === "REVIEW"
            ? `${dep.license} carries weak copyleft obligations — confirm they fit how you distribute.`
            : dep.policy === "UNKNOWN"
              ? "PoryGen could not determine this dependency's license. Check it before you ship."
              : null,
    });
  }

  const allDrafts = [...similarityDrafts, ...licenseDrafts];
  const actionable = allDrafts.filter((f) => f.severity !== "info");
  const informational = allDrafts.filter((f) => f.severity === "info");
  const findingsTruncated = actionable.length > limits.maxActionable || informational.length > limits.maxInformational;
  const findings = [...actionable.slice(0, limits.maxActionable), ...informational.slice(0, limits.maxInformational)];

  const riskLevel = combineRisk(licensePolicy, similarityDrafts);
  terminalLog.push(
    riskLevel === "clear"
      ? "[result] nothing needs attention"
      : `[result] ${flaggedFiles} file${flaggedFiles === 1 ? "" : "s"} flagged · risk ${riskLevel}`,
  );

  const repoContentHash = await sha256Hex(files.map((f) => `${f.path}:${f.bytes}`).sort().join("\n"));

  const summary: ScanSummary = {
    pipelineVersion: PIPELINE_VERSION,
    normalizer: normalizer.id,
    languages: Array.from(new Set(files.map((f) => detectLanguage(f.path)).filter((l) => l !== "unknown"))),
    referenceFingerprintsChecked: totalFingerprints,
    clearFindings: findings.filter((f) => f.severity === "info").length,
    reviewFindings: findings.filter((f) => f.severity === "review").length,
    blockingFindings: findings.filter((f) => f.severity === "blocking").length,
    terminalLog,
    coverage,
    providersRun: input.providers.map((p) => p.id),
    providerErrors,
    checkedPaths: probes.map((p) => p.path).slice(0, MAX_RECORDED_PATHS),
    ingestedPaths: files.map((f) => f.path).slice(0, MAX_RECORDED_PATHS),
    manifestsChecked,
    evaluatedFindingTypes: ["structural_similarity", "license"],
    findingsTruncated,
    similarity: counts,
    repoContentHash: shortHash(repoContentHash, 16),
    sbom: buildCycloneDxSbom(input.repositoryName, dependencyFindings),
    provenanceCoveragePercent: 0,
    provenanceComposition: { human: 0, ai: 0, humanModifiedAi: 0, unknown: 100 },
  };

  return { findings, summary, riskLevel, dependencyFindings, licenseFileFindings };
}
