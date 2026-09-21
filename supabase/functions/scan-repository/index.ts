// scan-repository: authenticated entry point for a repository scan.
//
// This handler owns only what is specific to this runtime: auth, safe GitHub
// ingestion (github.ts is the SSRF boundary), and persistence. The scan itself
// — normalize, fingerprint, compare through similarity providers, license
// context, finding drafts — is `runScanPipeline` from the vendored
// provenance-core (see _shared/ and scripts/sync-vendored-copies.mjs), the same
// code a worker, CI job, or local run uses. Every phase is written to
// `scans.status` as it happens, so the client shows genuine progress.
//
// Auth: scans and findings are written with the caller's own JWT, so Row Level
// Security applies to every insert. Only the resolution-history reconciliation
// (`sync_tracked_findings`) runs with the service role, because tracked
// findings and their history are server-authoritative: no client can mark a
// finding resolved without a scan that actually re-checked it.

import { createClient } from "npm:@supabase/supabase-js@2";
import { runScanPipeline, type FindingDraft } from "./_shared/scanner/pipeline.ts";
import { createReferenceCorpusProvider } from "./_shared/scanner/providers/referenceCorpus.ts";
import { createRegistryLicenseLookup } from "./_shared/scanner/license.ts";
import { parseGitHubUrl, fetchRepoMetadata, fetchRepoSnapshot, IngestError } from "./github.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** PostgREST reports an unknown column as PGRST204; Postgres as 42703. Either means the resolution migration isn't applied yet. */
function isMissingColumn(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error) return false;
  return (error.code === "PGRST204" || error.code === "42703") && (error.message ?? "").includes(column);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
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
  const terminalLog: string[] = [`[ingest] ${meta.fullName}@${meta.defaultBranch} accepted`];

  const updateScan = (patch: Record<string, unknown>) =>
    supabase.from("scans").update(patch).eq("id", scanId);

  try {
    await updateScan({ status: "indexing" });
    const snapshot = await fetchRepoSnapshot(parsed, meta.defaultBranch);
    const files = snapshot.files;

    const result = await runScanPipeline({
      repositoryName: repository.name,
      files,
      providers: [createReferenceCorpusProvider()],
      licenseLookup: createRegistryLicenseLookup(fetch),
      terminalLog,
      onPhase: async (phase, patch) => {
        if (phase === "indexing") return; // already set before ingestion
        await updateScan({ status: phase, ...patch });
      },
    });

    let historyAvailable = true;
    if (result.findings.length > 0) {
      const rows = result.findings.map((draft: FindingDraft) => ({ scan_id: scanId, ...draft }));
      let { error: findingsError } = await supabase.from("scan_findings").insert(rows);
      if (isMissingColumn(findingsError, "finding_key")) {
        historyAvailable = false;
        ({ error: findingsError } = await supabase
          .from("scan_findings")
          .insert(rows.map(({ finding_key: _key, ...rest }) => rest)));
      }
      if (findingsError) throw new Error(`Could not persist findings: ${findingsError.message}`);
    }

    await updateScan({
      status: "complete",
      finished_at: new Date().toISOString(),
      risk_level: result.riskLevel,
      summary_json: result.summary,
    });

    // Resolution history: detect new findings, keep accepted/dismissed decisions,
    // reopen regressions, and resolve findings this scan re-checked and no longer sees.
    let reconciliation: unknown = null;
    if (historyAvailable && SUPABASE_SERVICE_ROLE_KEY) {
      // Deleting a flagged file is a valid fix — but only a complete tree listing proves the file is gone.
      let missingPaths: string[] = [];
      if (snapshot.treeComplete) {
        const { data: openTracked } = await supabase
          .from("tracked_findings")
          .select("file_path")
          .eq("repository_id", repository.id)
          .in("status", ["open", "in_review"])
          .not("file_path", "is", null);
        missingPaths = (openTracked ?? [])
          .map((row: { file_path: string | null }) => row.file_path)
          .filter((path: string | null): path is string => Boolean(path) && !snapshot.allPaths.has(path!));
      }
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await admin.rpc("sync_tracked_findings", { p_scan_id: scanId, p_missing_paths: missingPaths });
      if (error) {
        terminalLog.push(`[history] resolution tracking unavailable: ${error.message}`);
      } else {
        reconciliation = data;
        const r = data as { detected?: number; resolved?: number; reopened?: number } | null;
        terminalLog.push(`[history] ${r?.detected ?? 0} new · ${r?.resolved ?? 0} resolved by this scan · ${r?.reopened ?? 0} reopened`);
      }
    } else {
      terminalLog.push("[history] resolution tracking unavailable on this deployment (migration pending)");
    }
    await updateScan({ summary_json: { ...result.summary, terminalLog } });

    return json({ scanId, repositoryId: repository.id, reconciliation });
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
