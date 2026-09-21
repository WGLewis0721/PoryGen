import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BitCritter, type BitCritterState } from "../../components/BitCritter";
import { PolicyBadge } from "../../components/PolicyBadge";
import { getScan, getRepository, listFindings } from "../../lib/api";
import type { RepositoryRow, ScanFindingRow, ScanRow } from "../../lib/dbTypes";
import type { PolicyStatus } from "@porygen/provenance-core";

const STATUS_LABEL: Record<ScanRow["status"], string> = {
  queued: "queued",
  ingesting: "ingesting repository",
  indexing: "indexing source files",
  normalizing_ast: "normalizing AST",
  fingerprinting: "computing structural fingerprints",
  analyzing_licenses: "analyzing licenses",
  building_provenance_summary: "building provenance summary",
  complete: "complete",
  failed: "failed",
};

const IN_PROGRESS: ScanRow["status"][] = [
  "queued", "ingesting", "indexing", "normalizing_ast", "fingerprinting",
  "analyzing_licenses", "building_provenance_summary",
];

function riskToPolicy(risk: ScanRow["risk_level"]): PolicyStatus {
  if (risk === "clear") return "CLEAR";
  if (risk === "review") return "REVIEW";
  if (risk === "blocking") return "BLOCKING";
  return "UNKNOWN";
}

function critterStateFor(scan: ScanRow | null): BitCritterState {
  if (!scan) return "idle";
  if (scan.status === "failed") return "integrity_warning";
  if (IN_PROGRESS.includes(scan.status)) return "ingesting";
  if (scan.risk_level === "blocking") return "blocking";
  if (scan.risk_level === "review") return "review";
  return "healthy";
}

export function ScanPage() {
  const { scanId } = useParams<{ scanId: string }>();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [repository, setRepository] = useState<RepositoryRow | null>(null);
  const [findings, setFindings] = useState<ScanFindingRow[]>([]);
  const [severityFilter, setSeverityFilter] = useState<"all" | ScanFindingRow["severity"]>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await getScan(scanId!);
        if (cancelled) return;
        setScan(next);
        if (next && !repository) {
          getRepository(next.repository_id).then((r) => !cancelled && setRepository(r));
        }
        if (next && next.status === "complete") {
          listFindings(scanId!).then((f) => !cancelled && setFindings(f));
        } else if (next && IN_PROGRESS.includes(next.status)) {
          timer = setTimeout(poll, 900);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load scan.");
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  if (error) return <div className="pg-form-error">{error}</div>;
  if (!scan) return <p style={{ color: "var(--pg-structure-dim)" }}>loading scan…</p>;

  const inProgress = IN_PROGRESS.includes(scan.status);
  const terminalLog: string[] = scan.summary_json?.terminalLog ?? [];
  const filteredFindings = severityFilter === "all" ? findings : findings.filter((f) => f.severity === severityFilter);

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>{repository?.name ?? "Scan"}</h1>
          <p>{repository?.clone_url}</p>
        </div>
        {scan.status === "complete" && (
          <div className="pg-page-actions">
            <Link to={`/scans/${scan.id}/evidence`} className="pg-btn pg-btn-primary">Export evidence</Link>
          </div>
        )}
      </div>

      <div className="pg-panel" style={{ padding: 24, marginBottom: 32, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <BitCritter state={critterStateFor(scan)} size={72} />
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--pg-structure-faint)", textTransform: "uppercase" }}>Scan status</div>
          <div style={{ marginTop: 6, fontSize: "0.95rem", fontWeight: 700 }}>
            {STATUS_LABEL[scan.status]}
            {inProgress && <span aria-hidden="true"> …</span>}
          </div>
          <div role="status" aria-live="polite" className="pg-visually-hidden">
            Scan status: {STATUS_LABEL[scan.status]}
          </div>
        </div>
        {scan.status === "complete" && scan.risk_level && (
          <div style={{ marginLeft: "auto" }}>
            <PolicyBadge status={riskToPolicy(scan.risk_level)} />
          </div>
        )}
      </div>

      <h2 className="pg-section-title">Terminal</h2>
      <div className="pg-terminal" aria-live="polite">
        {terminalLog.map((line, i) => (
          <span className="pg-terminal-line" key={i}>{line}</span>
        ))}
        {inProgress && <span className="pg-terminal-line pg-terminal-dim">…</span>}
      </div>

      {scan.status === "complete" && (
        <>
          <div className="pg-stat-grid" style={{ marginTop: 32 }}>
            <div className="pg-stat-cell">
              <div className="pg-stat-value">{scan.files_scanned}</div>
              <div className="pg-stat-label">Files scanned</div>
            </div>
            <div className="pg-stat-cell">
              <div className="pg-stat-value">{scan.dependencies_scanned}</div>
              <div className="pg-stat-label">Dependencies scanned</div>
            </div>
            <div className="pg-stat-cell">
              <div className="pg-stat-value">{scan.summary_json?.referenceFingerprintsChecked ?? 0}</div>
              <div className="pg-stat-label">Fingerprints retained</div>
            </div>
            <div className="pg-stat-cell">
              <div className="pg-stat-value">{scan.summary_json?.blockingFindings ?? 0}</div>
              <div className="pg-stat-label">Blocking findings</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40, marginBottom: 16 }}>
            <h2 className="pg-section-title" style={{ margin: 0 }}>Findings ({findings.length})</h2>
            <select
              className="pg-select"
              aria-label="Filter findings by severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            >
              <option value="all">all severities</option>
              <option value="blocking">blocking</option>
              <option value="review">review</option>
              <option value="info">info / clear</option>
            </select>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="pg-empty-state">
              <BitCritter state="healthy" size={48} />
              <p>No findings at this severity.</p>
            </div>
          ) : (
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Finding</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.map((finding) => (
                  <tr key={finding.id}>
                    <td><Link to={`/scans/${scan.id}/findings/${finding.id}`}>{finding.title}</Link></td>
                    <td>{finding.type.replace("_", " ")}</td>
                    <td>
                      <PolicyBadge status={finding.severity === "blocking" ? "BLOCKING" : finding.severity === "review" ? "REVIEW" : "CLEAR"} />
                    </td>
                    <td>{finding.file_path ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {scan.status === "failed" && (
        <div className="pg-form-error" style={{ marginTop: 24 }}>
          Scan failed{scan.error_code ? ` (${scan.error_code})` : ""}. See the terminal log above for detail.
        </div>
      )}
    </div>
  );
}
