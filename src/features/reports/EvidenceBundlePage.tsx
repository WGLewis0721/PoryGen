import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { verifyChain, type ProvenanceEvent } from "@porygen/provenance-core";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import {
  FeatureUnavailableError,
  getRepository,
  getScan,
  listFindingResolutions,
  listFindings,
  listProvenanceEvents,
  listTrackedFindings,
} from "../../lib/api";
import type { FindingResolutionRow, ProvenanceEventRow, RepositoryRow, ScanFindingRow, ScanRow, TrackedFindingRow } from "../../lib/dbTypes";
import { describeFinding } from "../../lib/findingVocabulary";
import { HISTORY_LABEL, STATUS_LABEL } from "../../lib/resolution";
import { formatDateTime, RISK_LABEL } from "../../lib/format";

function toChainEvent(row: ProvenanceEventRow): ProvenanceEvent {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    ownerId: row.owner_id,
    filePath: row.file_path,
    sourceType: row.source_type,
    actorType: row.actor_type,
    provider: row.provider,
    tool: row.tool,
    commitSha: row.commit_sha,
    parentEventId: row.parent_event_id,
    contentHash: row.content_hash,
    diffHash: row.diff_hash,
    eventTimestamp: row.event_timestamp,
    metadata: row.metadata_json,
    previousEventHash: row.previous_event_hash,
    eventHash: row.event_hash,
    createdAt: row.created_at,
  };
}

interface Bundle {
  scan: ScanRow;
  repository: RepositoryRow;
  findings: ScanFindingRow[];
  events: ProvenanceEventRow[];
  chainIntact: boolean | null;
  tracked: Array<TrackedFindingRow & { history: FindingResolutionRow[] }> | null;
}

const CLAIM_BOUNDARY =
  "This export is a record of what PoryGen checked, what it flagged, and what was decided. Similarity findings are evidence for review, not proof of copying; coverage is limited to the sources each scan compared against; license context is not legal advice; and nothing here certifies originality or non-infringement.";

export function EvidenceBundlePage() {
  const { scanId } = useParams<{ scanId: string }>();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("Evidence export — PoryGen");

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    (async () => {
      try {
        const scan = await getScan(scanId);
        if (!scan) throw new Error("This scan doesn't exist, or you don't have access to it.");
        const [repository, findings, events] = await Promise.all([getRepository(scan.repository_id), listFindings(scanId), listProvenanceEvents(scan.repository_id)]);
        if (!repository) throw new Error("The repository for this scan is no longer available.");
        const chainIntact = events.length > 0 ? (await verifyChain(events.map(toChainEvent))).intact : null;
        let tracked: Bundle["tracked"] = null;
        try {
          const rows = await listTrackedFindings({ repositoryId: repository.id });
          tracked = await Promise.all(rows.map(async (t) => ({ ...t, history: await listFindingResolutions(t.id) })));
        } catch (err) {
          if (!(err instanceof FeatureUnavailableError)) throw err;
        }
        if (!cancelled) setBundle({ scan, repository, findings, events, chainIntact, tracked });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not assemble the export.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (error) return <p className="notice notice-error">{error}</p>;
  if (!bundle) {
    return (
      <div className="page-loading" role="status">
        Assembling the export…
      </div>
    );
  }

  const { scan, repository, findings, events, chainIntact, tracked } = bundle;
  const generatedAt = new Date().toISOString();

  function downloadJson() {
    const payload = {
      generatedAt,
      repository: {
        id: repository.id,
        name: repository.name,
        cloneUrl: repository.clone_url,
        defaultBranch: repository.default_branch,
        provider: repository.provider,
        contentHash: scan.summary_json?.repoContentHash ?? null,
      },
      scan: {
        id: scan.id,
        status: scan.status,
        policyVersion: scan.policy_version,
        pipelineVersion: scan.summary_json?.pipelineVersion ?? null,
        startedAt: scan.started_at,
        finishedAt: scan.finished_at,
        filesScanned: scan.files_scanned,
        dependenciesScanned: scan.dependencies_scanned,
        riskLevel: scan.risk_level,
        coverage: scan.summary_json?.coverage ?? null,
      },
      findings: findings.map((f) => ({
        id: f.id,
        findingKey: f.finding_key ?? null,
        type: f.type,
        severity: f.severity,
        label: describeFinding(f).label,
        title: f.title,
        filePath: f.file_path,
        lines: f.line_start ? [f.line_start, f.line_end ?? f.line_start] : null,
        confidence: f.confidence,
        evidence: f.evidence_json,
        remediation: f.remediation,
      })),
      resolutionHistory: tracked?.map((t) => ({
        findingKey: t.finding_key,
        title: t.title,
        filePath: t.file_path,
        status: t.status,
        firstScanId: t.first_scan_id,
        resolvedScanId: t.resolved_scan_id,
        history: t.history.map((h) => ({
          action: h.action,
          actor: h.actor_kind,
          fromStatus: h.from_status,
          toStatus: h.to_status,
          note: h.note,
          revision: h.revision,
          scanId: h.scan_id,
          rescanScanId: h.rescan_scan_id,
          at: h.created_at,
        })),
      })) ?? null,
      dependencyInventory: scan.summary_json?.sbom ?? null,
      editorAttribution: {
        events: events.map((e) => ({
          filePath: e.file_path,
          sourceType: e.source_type,
          tool: e.tool,
          at: e.event_timestamp,
          eventHash: e.event_hash,
          previousEventHash: e.previous_event_hash,
        })),
        hashChain: { intact: chainIntact, eventCount: events.length },
      },
      claimBoundary: CLAIM_BOUNDARY,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `porygen-evidence-${repository.name.replace(/[^\w.-]+/g, "_")}-${scan.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const actionable = findings.filter((f) => describeFinding(f).actionable);

  return (
    <div>
      <Link to={`/scans/${scan.id}`} className="back-link no-print">
        <ArrowLeft aria-hidden="true" /> Back to the scan
      </Link>
      <header className="page-head no-print">
        <div>
          <h1>Evidence export</h1>
          <p>
            {repository.name} · scan of {formatDateTime(scan.finished_at ?? scan.created_at)}. Download the full record as JSON, or
            print the summary below.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer aria-hidden="true" /> Print summary
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadJson}>
            <Download aria-hidden="true" /> Download JSON
          </button>
        </div>
      </header>

      <article className="print-report">
        <h1 className="block-title-lg">PoryGen evidence summary</h1>
        <p className="fine">Generated {formatDateTime(generatedAt)}</p>

        <h2>Repository and scan</h2>
        <div className="kv">
          <div className="kv-cell">
            <div className="kv-key">Repository</div>
            <div className="kv-value">{repository.name}</div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Result</div>
            <div className="kv-value">{scan.risk_level ? RISK_LABEL[scan.risk_level] : scan.status}</div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Files / dependencies</div>
            <div className="kv-value">
              {scan.files_scanned} / {scan.dependencies_scanned}
            </div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Content hash</div>
            <div className="kv-value mono">{scan.summary_json?.repoContentHash ?? "—"}</div>
          </div>
        </div>

        <h2>Compared against</h2>
        {(scan.summary_json?.coverage ?? []).length > 0 ? (
          (scan.summary_json?.coverage ?? []).map((c) => (
            <p className="answer" key={c.providerId}>
              <strong>{c.providerName}:</strong> {c.claim}
            </p>
          ))
        ) : (
          <p className="answer">PoryGen's configured reference corpus (scan predates coverage records).</p>
        )}

        <h2>Findings needing attention ({actionable.length})</h2>
        {actionable.length === 0 ? (
          <p className="answer">None at the time of this scan.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Finding</th>
                  <th scope="col">File</th>
                </tr>
              </thead>
              <tbody>
                {actionable.map((f) => (
                  <tr key={f.id}>
                    <td>{describeFinding(f).label}</td>
                    <td>{f.title}</td>
                    <td className="mono">{f.file_path ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Resolution history</h2>
        {tracked === null ? (
          <p className="answer">Not enabled on this deployment.</p>
        ) : tracked.length === 0 ? (
          <p className="answer">No tracked findings for this repository.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Finding</th>
                  <th scope="col">Status</th>
                  <th scope="col">History</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.file_path ?? t.title}
                      <div className="row-meta">{t.title}</div>
                    </td>
                    <td>{STATUS_LABEL[t.status]}</td>
                    <td>{t.history.map((h) => `${HISTORY_LABEL[h.action]} (${formatDateTime(h.created_at)})`).join(" → ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Editor attribution</h2>
        <p className="answer">
          {events.length === 0
            ? "No editor events captured (optional VS Code extension)."
            : `${events.length} events · hash chain ${chainIntact ? "intact" : "failed verification"}.`}
        </p>

        <p className="fine block">{CLAIM_BOUNDARY}</p>
      </article>
    </div>
  );
}
