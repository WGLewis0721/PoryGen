import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { feedRepository, listRepositories, listScansForRepository } from "../../lib/api";
import type { RepositoryRow, ScanRow } from "../../lib/dbTypes";
import { relativeTime, riskTone, RISK_LABEL } from "../../lib/format";

export function RepositoriesPage() {
  useDocumentTitle("Repositories — PoryGen");
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [latest, setLatest] = useState<Record<string, ScanRow | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repos = await listRepositories();
        if (cancelled) return;
        setRepositories(repos);
        const entries = await Promise.all(repos.map(async (r) => [r.id, (await listScansForRepository(r.id))[0]] as const));
        if (!cancelled) setLatest(Object.fromEntries(entries));
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

  async function rescan(repo: RepositoryRow) {
    setRescanning(repo.id);
    setError(null);
    try {
      const { scanId } = await feedRepository(repo.clone_url);
      navigate(`/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a rescan.");
      setRescanning(null);
    }
  }

  const own = repositories.filter((r) => !r.is_demo);
  const sample = repositories.filter((r) => r.is_demo);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Repositories</h1>
          <p>Every repository you've checked, with its latest result. Rescan after a fix to verify it.</p>
        </div>
        <div className="page-actions">
          <Link to="/repositories/new" className="btn btn-primary">
            Scan a repo
          </Link>
        </div>
      </header>

      {error && <p className="notice notice-error block-notice">{error}</p>}

      {loading ? (
        <div className="page-loading" role="status">
          Loading repositories…
        </div>
      ) : (
        <>
          {own.length === 0 ? (
            <div className="empty">
              <h2>No repositories yet.</h2>
              <p>Scan a public GitHub repository to see what's clear and what deserves a look.</p>
              <Link to="/repositories/new" className="btn btn-primary">
                Scan a repo
              </Link>
            </div>
          ) : (
            <ul className="rows">
              {own.map((repo) => {
                const scan = latest[repo.id];
                return (
                  <li className="row" key={repo.id}>
                    {scan?.risk_level ? <ToneTag tone={riskTone(scan.risk_level)}>{RISK_LABEL[scan.risk_level]}</ToneTag> : <span className="tag tag-quiet">{scan ? scan.status : "Not scanned"}</span>}
                    <div className="row-main">
                      {scan ? (
                        <Link className="row-title" to={`/scans/${scan.id}`}>
                          {repo.name}
                        </Link>
                      ) : (
                        <span className="row-title">{repo.name}</span>
                      )}
                      <span className="row-meta">
                        {repo.clone_url} · {scan ? `last scanned ${relativeTime(scan.created_at)}` : "never scanned"}
                      </span>
                    </div>
                    <div className="row-side">
                      {repo.provider === "github" && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => rescan(repo)} disabled={rescanning !== null}>
                          <RefreshCw aria-hidden="true" />
                          {rescanning === repo.id ? "Starting…" : "Rescan"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {sample.length > 0 && (
            <section className="block" aria-labelledby="repos-sample">
              <h2 id="repos-sample" className="block-title">
                Public sample
              </h2>
              <ul className="rows block-gap">
                {sample.map((repo) => {
                  const scan = latest[repo.id];
                  return (
                    <li className="row" key={repo.id}>
                      <span className="tag tag-quiet">Sample</span>
                      <div className="row-main">
                        {scan ? (
                          <Link className="row-title" to={`/scans/${scan.id}`}>
                            {repo.name}
                          </Link>
                        ) : (
                          <span className="row-title">{repo.name}</span>
                        )}
                        <span className="row-meta">A seeded, deterministic scan anyone can open. Actions are turned off.</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
