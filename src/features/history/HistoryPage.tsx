import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { FeatureUnavailableError, listRecentResolutions, listRepositories, type ResolutionActivity } from "../../lib/api";
import type { RepositoryRow } from "../../lib/dbTypes";
import { HISTORY_LABEL } from "../../lib/resolution";
import { formatDateTime } from "../../lib/format";
import { AttributionLedger } from "./AttributionLedger";

export function HistoryPage() {
  useDocumentTitle("History — PoryGen");
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "attribution" ? "attribution" : "resolutions";
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [activity, setActivity] = useState<ResolutionActivity[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repositoryParam = params.get("repository");

  useEffect(() => {
    let cancelled = false;
    listRepositories()
      .then((repos) => !cancelled && setRepositories(repos))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load repositories."));
    listRecentResolutions(200)
      .then((rows) => !cancelled && setActivity(rows))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) setUnavailable(true);
        else setError(err instanceof Error ? err.message : "Could not load history.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const own = useMemo(() => repositories.filter((r) => !r.is_demo), [repositories]);
  const ownIds = useMemo(() => new Set(own.map((r) => r.id)), [own]);
  const repoName = (id: string) => repositories.find((r) => r.id === id)?.name ?? "repository";
  const mine = (activity ?? []).filter((a) => ownIds.has(a.repository_id));
  const attributionRepo = repositoryParam ?? repositories[0]?.id ?? null;

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>History</h1>
          <p>
            What was checked, what was flagged, what you decided, and what a later scan confirmed. Entries are append-only — nobody
            can edit them after the fact.
          </p>
        </div>
        <div className="filters" role="group" aria-label="History view">
          <button type="button" className="filter" aria-pressed={view === "resolutions"} onClick={() => setParams({})}>
            Resolution history
          </button>
          <button type="button" className="filter" aria-pressed={view === "attribution"} onClick={() => setParams({ view: "attribution" })}>
            Editor attribution
          </button>
        </div>
      </header>

      {error && <p className="notice notice-error block-notice">{error}</p>}

      {view === "resolutions" ? (
        unavailable ? (
          <div className="empty">
            <h2>Resolution history isn't enabled here yet.</h2>
            <p>This deployment hasn't applied the resolution-history migration. Scans and findings still work.</p>
          </div>
        ) : activity === null ? (
          <div className="page-loading" role="status">
            Loading history…
          </div>
        ) : mine.length === 0 ? (
          <div className="empty">
            <h2>Nothing recorded yet.</h2>
            <p>History starts with your first scan that finds something worth a look.</p>
            <Link to="/repositories/new" className="btn btn-primary">
              Scan a repo
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Finding</th>
                  <th scope="col">By</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((a) => {
                  const t = a.tracked_findings;
                  return (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.created_at)}</td>
                      <td>
                        <span className={`tag ${a.to_status === "resolved" ? "tag-clear" : a.actor_kind === "user" ? "tag-neutral" : "tag-quiet"}`}>
                          {HISTORY_LABEL[a.action]}
                        </span>
                      </td>
                      <td>
                        {t?.last_seen_scan_id && t.latest_finding_id ? (
                          <Link to={`/scans/${t.last_seen_scan_id}/findings/${t.latest_finding_id}`}>{t.file_path ?? t.title}</Link>
                        ) : (
                          (t?.file_path ?? t?.title ?? "Finding")
                        )}
                        <div className="row-meta">{repoName(a.repository_id)}</div>
                      </td>
                      <td>{a.actor_kind === "user" ? "You" : "PoryGen"}</td>
                      <td>{[a.note, a.revision ? `Revision ${a.revision}` : null].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <AttributionLedger
          repositories={repositories}
          repositoryId={attributionRepo}
          onRepositoryChange={(id) => setParams({ view: "attribution", repository: id })}
        />
      )}
    </div>
  );
}
