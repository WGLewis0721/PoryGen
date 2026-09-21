import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { listRepositories, listScansForRepository } from "../../lib/api";
import type { RepositoryRow, ScanRow } from "../../lib/dbTypes";

export function RepositoriesPage() {
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [latestScanByRepo, setLatestScanByRepo] = useState<Record<string, ScanRow | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repos = await listRepositories();
        if (cancelled) return;
        setRepositories(repos);
        const entries = await Promise.all(
          repos.map(async (r) => [r.id, (await listScansForRepository(r.id))[0]] as const),
        );
        if (cancelled) return;
        setLatestScanByRepo(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load repositories.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>Repositories</h1>
          <p>Every repository you've fed, with its most recent scan status.</p>
        </div>
        <div className="pg-page-actions">
          <Link to="/repositories/new" className="pg-btn pg-btn-primary">Feed a repository</Link>
        </div>
      </div>

      {error && <div className="pg-form-error" style={{ marginBottom: 24 }}>{error}</div>}

      {loading ? (
        <p style={{ color: "var(--pg-structure-dim)" }}>loading…</p>
      ) : repositories.length === 0 ? (
        <div className="pg-empty-state">
          <BitCritter state="idle" size={56} />
          <p>No repositories fed yet.</p>
          <Link to="/repositories/new" className="pg-btn pg-btn-primary">Feed a repository</Link>
        </div>
      ) : (
        <div className="pg-card-grid">
          {repositories.map((repo) => {
            const scan = latestScanByRepo[repo.id];
            return (
              <div className="pg-card" key={repo.id}>
                <div className="pg-card-title">
                  {repo.name}
                  {repo.is_demo && <span className="pg-badge pg-badge-info" style={{ marginLeft: 8 }}>demo</span>}
                </div>
                <div className="pg-card-meta">{repo.clone_url}</div>
                <div className="pg-card-meta">
                  {scan ? `Last scan: ${scan.status} · ${new Date(scan.created_at).toLocaleDateString()}` : "Not scanned yet"}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {scan && (
                    <Link to={`/scans/${scan.id}`} className="pg-btn pg-btn-ghost" style={{ flex: 1 }}>
                      view scan
                    </Link>
                  )}
                  <Link
                    to={`/provenance?repository=${repo.id}`}
                    className="pg-btn pg-btn-ghost"
                    style={{ flex: 1 }}
                  >
                    ledger
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
