// scan-repository: the real scanner vertical slice, running server-side.
//
// Pipeline: ingest (safe GitHub fetch) -> index -> normalize (lexical
// structural normalizer — see _shared/scanner and docs/SCANNER.md for why
// this path doesn't use the tree-sitter reference implementation) ->
// fingerprint (winnowing) -> analyze licenses -> build provenance summary ->
// complete. Every phase transition is written to `scans.status` as it
// happens, so the client's poll loop renders genuine progress, not a canned
// animation.
//
// Auth: this function forwards the caller's own JWT to the Supabase client,
// so every insert runs through Row Level Security as that user — no
// service-role key is used or needed here.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  detectLanguage,
  lexicalNormalize,
} from "./_shared/scanner/lexicalNormalize.ts";
import { fingerprintTokens } from "./_shared/scanner/winnow.ts";
import { matchAgainstCorpus } from "./_shared/scanner/corpus.ts";
import {
  scanLicenseFiles,
  evaluateDependencyLicenses,
  createRegistryLicenseLookup,
  summarizePolicy,
  policyForLicense,
} from "./_shared/scanner/license.ts";
import { sha256Hex, shortHash } from "./_shared/fingerprint.ts";
import { buildCycloneDxSbom } from "./_shared/sbom.ts";
import { parseGitHubUrl, fetchRepoMetadata, fetchRepoFiles, IngestError } from "./github.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);
  const ownerId = userData.user.id;

  let body: { repositoryUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.repositoryUrl || typeof body.repositoryUrl !== "string") {
    return json({ error: "repositoryUrl is required" }, 400);
  }

  let parsed;
  try {
    parsed = parseGitHubUrl(body.repositoryUrl);
  } catch (err) {
    if (err instanceof IngestError) return json({ error: err.message, code: err.code }, 422);
    throw err;
  }

  let meta;
  try {
    meta = await fetchRepoMetadata(parsed);
  } catch (err) {
    if (err instanceof IngestError) return json({ error: err.message, code: err.code }, 422);
    throw err;
  }

  const cloneUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

  const { data: repository, error: repoError } = await supabase
    .from("repositories")
    .upsert(
      {
        owner_id: ownerId,
        name: meta.fullName,
        provider: "github",
        clone_url: cloneUrl,
        default_branch: meta.defaultBranch,
        visibility: meta.visibility,
        last_scanned_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,clone_url" },
    )
    .select()
    .single();

  if (repoError || !repository) {
    return json({ error: repoError?.message ?? "Could not persist repository" }, 500);
  }

  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .insert({ repository_id: repository.id, owner_id: ownerId, status: "ingesting" })
    .select()
    .single();

  if (scanError || !scan) {
    return json({ error: scanError?.message ?? "Could not create scan" }, 500);
  }

  const scanId = scan.id as string;
  const terminalLog: string[] = ["[ingest] repository manifest accepted"];

  const updateScan = (patch: Record<string, unknown>) =>
    supabase.from("scans").update(patch).eq("id", scanId);

  try {
    // ---- index --------------------------------------------------------
    await updateScan({ status: "indexing" });
    const files = await fetchRepoFiles(parsed, meta.defaultBranch);
    const totalLoc = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);
    terminalLog.push(`[index] ${files.length} source files · ${totalLoc.toLocaleString()} LOC`);

    // ---- normalize AST (lexical structural normalizer) -----------------
    await updateScan({ status: "normalizing_ast", files_scanned: files.length });
    let totalTokens = 0;
    const normalized = files.map((file) => {
      const lang = detectLanguage(file.path);
      const tokens = lexicalNormalize(file.content, lang);
      totalTokens += tokens.length;
      return { path: file.path, tokens };
    });
    terminalLog.push(`[ast] ${totalTokens.toLocaleString()} syntax nodes normalized`);

    // ---- fingerprint -----------------------------------------------------
    await updateScan({ status: "fingerprinting" });
    let totalFingerprints = 0;
    const structuralFindings: Array<{
      path: string;
      entryId: string;
      entryTitle: string;
      entryLicense: string;
      containment: number;
    }> = [];
    for (const file of normalized) {
      const fps = fingerprintTokens(file.tokens);
      totalFingerprints += fps.length;
      if (fps.length === 0) continue;
      const matches = matchAgainstCorpus(fps);
      for (const match of matches) {
        structuralFindings.push({
          path: file.path,
          entryId: match.entryId,
          entryTitle: match.entryTitle,
          entryLicense: match.entryLicense,
          containment: match.containment,
        });
      }
    }
    terminalLog.push(`[winnow] ${totalFingerprints.toLocaleString()} fingerprints retained`);
    terminalLog.push(
      `[corpus] ${normalized.length} files evaluated against ${structuralFindings.length > 0 ? "matching" : "0 matching"} reference candidates`,
    );

    // ---- analyze licenses --------------------------------------------------
    await updateScan({ status: "analyzing_licenses" });
    const fileMap: Record<string, string> = {};
    for (const f of files) fileMap[f.path.split("/").pop() === f.path ? f.path : f.path] = f.content;
    // also index by basename for manifest lookups at repo root or nested
    for (const f of files) {
      const base = f.path.split("/").pop()!;
      if (!(base in fileMap)) fileMap[base] = f.content;
    }
    const licenseFileFindings = scanLicenseFiles(fileMap);
    const registryLookup = createRegistryLicenseLookup(fetch);
    const dependencyFindings = await evaluateDependencyLicenses(fileMap, registryLookup);
    const overallPolicy = summarizePolicy(licenseFileFindings, dependencyFindings);
    const blockingLicense = dependencyFindings.find((d) => d.policy === "BLOCKING");
    if (blockingLicense) {
      terminalLog.push(`[license] ${blockingLicense.license} candidate found in dependency graph`);
    } else {
      terminalLog.push(`[license] ${dependencyFindings.length} dependencies evaluated`);
    }
    terminalLog.push(`[policy] ${overallPolicy === "CLEAR" ? "no blocking findings detected" : overallPolicy.toLowerCase() + " required"}`);

    // ---- build provenance summary ------------------------------------------
    await updateScan({ status: "building_provenance_summary", dependencies_scanned: dependencyFindings.length });

    const findingsRows: Array<Record<string, unknown>> = [];

    for (const finding of licenseFileFindings) {
      findingsRows.push({
        scan_id: scanId,
        type: "license",
        severity: policyForLicense(finding.detected) === "BLOCKING" ? "blocking" : policyForLicense(finding.detected) === "CLEAR" ? "info" : "review",
        title: `${finding.detected} license file detected`,
        file_path: finding.path,
        evidence_json: { detected: finding.detected },
        remediation: policyForLicense(finding.detected) === "CLEAR" ? null : "Review license terms against your distribution model.",
      });
    }

    for (const dep of dependencyFindings.slice(0, 40)) {
      findingsRows.push({
        scan_id: scanId,
        type: "license",
        severity: dep.policy === "BLOCKING" ? "blocking" : dep.policy === "CLEAR" ? "info" : "review",
        title: `${dep.ecosystem} dependency "${dep.name}" — ${dep.license}`,
        file_path: null,
        evidence_json: { name: dep.name, version: dep.version ?? null, ecosystem: dep.ecosystem, license: dep.license, source: dep.source },
        remediation:
          dep.policy === "BLOCKING"
            ? `${dep.license} carries strong copyleft obligations under the default commercial policy — route to counsel review before distribution.`
            : dep.policy === "REVIEW"
              ? `${dep.license} carries weak copyleft obligations — confirm distribution model compliance.`
              : null,
      });
    }

    for (const match of structuralFindings.slice(0, 20)) {
      findingsRows.push({
        scan_id: scanId,
        type: "structural_similarity",
        severity: "review",
        title: `Structural fingerprint match: ${match.entryTitle}`,
        file_path: match.path,
        confidence: Number(match.containment.toFixed(3)),
        evidence_json: {
          corpusEntryId: match.entryId,
          corpusEntryLicense: match.entryLicense,
          containment: match.containment,
          note: "Structural fingerprint match against configured reference corpus.",
        },
        remediation: "Compare against the referenced corpus entry and confirm independent authorship or required attribution.",
      });
    }

    if (findingsRows.length > 0) {
      const { error: findingsError } = await supabase.from("scan_findings").insert(findingsRows);
      if (findingsError) throw new Error(`Could not persist findings: ${findingsError.message}`);
    }

    const repoContentHash = await sha256Hex(
      files.map((f) => `${f.path}:${f.bytes}`).sort().join("\n"),
    );
    const sbom = buildCycloneDxSbom(repository.name, dependencyFindings);

    const summary = {
      languages: Array.from(new Set(files.map((f) => detectLanguage(f.path)).filter((l) => l !== "unknown"))),
      referenceFingerprintsChecked: totalFingerprints,
      clearFindings: findingsRows.filter((f) => f.severity === "info").length,
      reviewFindings: findingsRows.filter((f) => f.severity === "review").length,
      blockingFindings: findingsRows.filter((f) => f.severity === "blocking").length,
      provenanceCoveragePercent: 0,
      terminalLog,
      provenanceComposition: { human: 0, ai: 0, humanModifiedAi: 0, unknown: 100 },
      repoContentHash: shortHash(repoContentHash, 16),
      sbom,
    };

    const riskLevel = overallPolicy.toLowerCase() as "clear" | "review" | "blocking" | "unknown";

    await updateScan({
      status: "complete",
      finished_at: new Date().toISOString(),
      risk_level: riskLevel,
      summary_json: summary,
    });

    return json({ scanId, repositoryId: repository.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown scan failure";
    await updateScan({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: "SCAN_FAILED",
      summary_json: { terminalLog: [...terminalLog, `[error] ${message}`] },
    });
    return json({ error: message, scanId }, 500);
  }
});
