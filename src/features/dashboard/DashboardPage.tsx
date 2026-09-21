import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BitCritter, type BitCritterState } from "../../components/BitCritter";
import { PolicyBadge } from "../../components/PolicyBadge";
import { listRepositories, listScansForRepository } from "../../lib/api";
import type { RepositoryRow, ScanRow } from "../../lib/dbTypes";
import type { PolicyStatus } from "@porygen/provenance-core";

function riskToPolicy(risk: ScanRow["risk_level"]): PolicyStatus {
  if (risk === "clear") return "CLEAR";
  if (risk === "review") return "REVIEW";
  if (risk === "blocking") return "BLOCKING";
  return "UNKNOWN";
}

function riskToCritterState(risk: ScanRow["risk_level"] | undefined): BitCritterState {
  if (!risk) return "idle";
  if (risk === "clear") return "healthy";
  if (risk === "review") return "review";
  if (risk === "blocking") return "blocking";
  return "idle";
}

export function DashboardPage() {
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [recentScans, setRecentScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repos = await listRepositories();
        if (cancelled) return;
        setRepositories(repos);
        const scanLists = await Promise.all(repos.slice(0, 8).map((r) => listScansForRepository(r.id)));
        if (cancelled) return;
        const all = scanLists.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRecentScans(all.slice(0, 8));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestScan = recentScans[0];
  const blockingCount = recentScans.filter((s) => s.risk_level === "blocking").length;
  const reviewCount = recentScans.filter((s) => s.risk_level === "review").length;

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of fed repositories, scan status, and outstanding policy findings.</p>
        </div>
        <div className="pg-page-actions">
          <Link to="/repositories/new" className="pg-btn pg-btn-primary">Feed a repository</Link>
        </div>
      </div>

      <div className="pg-panel" style={{ padding: 24, marginBottom: 32, display: "flex", gap: 24, alignItems: "center" }}>
        <BitCritter state={riskToCritterState(latestScan?.risk_level ?? undefined)} size={80} />
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--pg-structure-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Latest scan status
          </div>
          <div style={{ marginTop: 6 }}>
            {latestScan ? <PolicyBadge status={riskToPolicy(latestScan.risk_level)} /> : <span className="pg-structure-dim">No scans yet</span>}
          </div>
        </div>
      </div>

      <div className="pg-stat-grid">
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{repositories.length}</div>
          <div className="pg-stat-label">Repositories fed</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{recentScans.length}</div>
          <div className="pg-stat-label">Recent scans</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{reviewCount}</div>
          <div className="pg-stat-label">Review scans</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{blockingCount}</div>
          <div className="pg-stat-label">Blocking scans</div>
        </div>
      </div>

      {error && <div className="pg-form-error" style={{ marginBottom: 24 }}>{error}</div>}

      <h2 className="pg-section-title">Recent scans</h2>
      {loading ? (
        <p style={{ color: "var(--pg-structure-dim)" }}>loading…</p>
      ) : recentScans.length === 0 ? (
        <div className="pg-empty-state">
          <BitCritter state="idle" size={56} />
          <p>No scans yet. Feed a repository to run the first one.</p>
          <Link to="/repositories/new" className="pg-btn pg-btn-primary">Feed a repository</Link>
        </div>
      ) : (
        <table className="pg-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Files</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {recentScans.map((scan) => {
              const repo = repositories.find((r) => r.id === scan.repository_id);
              return (
                <tr key={scan.id}>
                  <td><Link to={`/scans/${scan.id}`}>{repo?.name ?? scan.repository_id}</Link></td>
                  <td>{scan.status}</td>
                  <td>{scan.risk_level ? <PolicyBadge status={riskToPolicy(scan.risk_level)} /> : "—"}</td>
                  <td>{scan.files_scanned}</td>
                  <td>{new Date(scan.started_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
