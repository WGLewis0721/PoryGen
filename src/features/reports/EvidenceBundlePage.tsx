import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyChain, type ProvenanceEvent } from "@porygen/provenance-core";
import { getScan, getRepository, listFindings, listProvenanceEvents } from "../../lib/api";
import type { ProvenanceEventRow, RepositoryRow, ScanFindingRow, ScanRow } from "../../lib/dbTypes";

function toChainEvent(row: ProvenanceEventRow): ProvenanceEvent {
  return {
    id: row.id,
    repositoryId: row.repository_id,
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

export function EvidenceBundlePage() {
  const { scanId } = useParams<{ scanId: string }>();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [repository, setRepository] = useState<RepositoryRow | null>(null);
  const [findings, setFindings] = useState<ScanFindingRow[]>([]);
  const [events, setEvents] = useState<ProvenanceEventRow[]>([]);
  const [chainIntact, setChainIntact] = useState<boolean | null>(null);

  useEffect(() => {
    if (!scanId) return;
    (async () => {
      const s = await getScan(scanId);
      setScan(s);
      if (!s) return;
      const [repo, f, ev] = await Promise.all([
        getRepository(s.repository_id),
        listFindings(scanId),
        listProvenanceEvents(s.repository_id),
      ]);
      setRepository(repo);
      setFindings(f);
      setEvents(ev);
      if (ev.length > 0) {
        const result = await verifyChain(ev.map(toChainEvent));
        setChainIntact(result.intact);
      }
    })();
  }, [scanId]);

  if (!scan || !repository) return <p style={{ color: "var(--pg-structure-dim)" }}>loading evidence bundle…</p>;

  const generatedAt = new Date().toISOString();
  const bundle = {
    generationTimestamp: generatedAt,
    repository: {
      id: repository.id,
      name: repository.name,
      cloneUrl: repository.clone_url,
      defaultBranch: repository.default_branch,
      provider: repository.provider,
      gitRevision: scan.summary_json?.repoContentHash ?? null,
    },
    scan: {
      id: scan.id,
      status: scan.status,
      policyVersion: scan.policy_version,
      startedAt: scan.started_at,
      finishedAt: scan.finished_at,
      filesScanned: scan.files_scanned,
      dependenciesScanned: scan.dependencies_scanned,
      riskLevel: scan.risk_level,
    },
    findings: findings.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      title: f.title,
      filePath: f.file_path,
      confidence: f.confidence,
      evidence: f.evidence_json,
      remediation: f.remediation,
    })),
    dependencyInventory: scan.summary_json?.sbom ?? null,
    provenanceSummary: scan.summary_json?.provenanceComposition ?? null,
    provenanceEvents: events.map((e) => ({
      id: e.id,
      filePath: e.file_path,
      sourceType: e.source_type,
      actorType: e.actor_type,
      tool: e.tool,
      eventTimestamp: e.event_timestamp,
      eventHash: e.event_hash,
      previousEventHash: e.previous_event_hash,
    })),
    hashChainState: { intact: chainIntact, eventCount: events.length },
    claimBoundary:
      "This bundle is provenance evidence for engineering, diligence, compliance, or counsel review. " +
      "It is not a legal certification of authorship, originality, or non-infringement.",
  };

  function downloadJson() {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `porygen-evidence-${scan!.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const blockingCount = scan.summary_json?.blockingFindings ?? 0;
  const canGenerateBadge = scan.status === "complete" && blockingCount === 0;

  return (
    <div>
      <div className="pg-page-header pg-no-print">
        <div>
          <h1>Evidence bundle</h1>
          <p>{repository.name} · scan {scan.id.slice(0, 8)}</p>
        </div>
        <div className="pg-page-actions">
          <button type="button" className="pg-btn pg-btn-ghost" onClick={() => window.print()}>print report</button>
          <button type="button" className="pg-btn pg-btn-primary" onClick={downloadJson}>Export evidence (JSON)</button>
        </div>
      </div>

      <article className="pg-print-report">
        <h1 style={{ fontSize: "1.2rem" }}>PoryGen evidence report</h1>
        <p style={{ color: "var(--pg-structure-dim)", fontSize: "0.85rem" }}>Generated {generatedAt}</p>

        <h2 className="pg-section-title">Repository</h2>
        <div className="pg-kv-grid">
          <div className="pg-kv-cell"><div className="pg-kv-key">Name</div><div className="pg-kv-value">{repository.name}</div></div>
          <div className="pg-kv-cell"><div className="pg-kv-key">Clone URL</div><div className="pg-kv-value">{repository.clone_url}</div></div>
          <div className="pg-kv-cell"><div className="pg-kv-key">Content hash</div><div className="pg-kv-value">{scan.summary_json?.repoContentHash ?? "—"}</div></div>
        </div>

        <h2 className="pg-section-title">Scan</h2>
        <div className="pg-kv-grid">
          <div className="pg-kv-cell"><div className="pg-kv-key">Policy version</div><div className="pg-kv-value">{scan.policy_version}</div></div>
          <div className="pg-kv-cell"><div className="pg-kv-key">Risk level</div><div className="pg-kv-value">{scan.risk_level}</div></div>
          <div className="pg-kv-cell"><div className="pg-kv-key">Files / dependencies</div><div className="pg-kv-value">{scan.files_scanned} / {scan.dependencies_scanned}</div></div>
        </div>

        <h2 className="pg-section-title">Findings ({findings.length})</h2>
        <table className="pg-table">
          <thead><tr><th>Title</th><th>Type</th><th>Severity</th></tr></thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id}><td>{f.title}</td><td>{f.type}</td><td>{f.severity}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 className="pg-section-title">Provenance chain</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--pg-structure-dim)" }}>
          {events.length} events · {chainIntact === null ? "no events to verify" : chainIntact ? "chain intact" : "chain verification failed"}
        </p>

        <p style={{ marginTop: 24, fontSize: "0.78rem", color: "var(--pg-structure-faint)" }}>{bundle.claimBoundary}</p>
      </article>

      {canGenerateBadge && (
        <div className="pg-panel pg-no-print" style={{ padding: 24, marginTop: 32 }}>
          <h2 style={{ fontSize: "1rem" }}>PoryGen Verified: Clear</h2>
          <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--pg-structure-dim)" }}>
            No blocking findings were detected under policy {scan.policy_version} at scan time {scan.finished_at}.
            This is a snapshot, not a perpetual certification.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <div className="pg-kv-key">Markdown</div>
              <pre className="pg-terminal" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                {`[![PoryGen Verified: Clear](https://porygen.dev/badge.svg)](https://porygen.dev/audit/${scan.id})`}
              </pre>
            </div>
            <div>
              <div className="pg-kv-key">HTML</div>
              <pre className="pg-terminal" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                {`<a href="https://porygen.dev/audit/${scan.id}"><img src="https://porygen.dev/badge.svg" alt="PoryGen Verified: Clear"/></a>`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
