import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StatusTag, ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { FeatureUnavailableError, listRepositories, listTrackedFindings } from "../../lib/api";
import type { RepositoryRow, TrackedFindingRow } from "../../lib/dbTypes";
import { describeFinding } from "../../lib/findingVocabulary";
import { relativeTime } from "../../lib/format";

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "collisions", label: "Source collisions" },
  { id: "review", label: "Review suggested" },
  { id: "resolved", label: "Resolved" },
  { id: "decided", label: "Accepted or dismissed" },
  { id: "all", label: "All" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const isOpen = (t: TrackedFindingRow) => t.status === "open" || t.status === "in_review";
const isCollision = (t: TrackedFindingRow) => t.band === "strong_match" || t.severity === "blocking";

function matches(filter: FilterId, t: TrackedFindingRow): boolean {
  switch (filter) {
    case "open":
      return isOpen(t);
    case "collisions":
      return isOpen(t) && isCollision(t);
    case "review":
      return isOpen(t) && !isCollision(t);
    case "resolved":
      return t.status === "resolved";
    case "decided":
      return t.status === "accepted_risk" || t.status === "dismissed_false_positive";
    case "all":
      return true;
  }
}

export function FindingsPage() {
  useDocumentTitle("Findings — PoryGen");
  const [params, setParams] = useSearchParams();
  const requested = params.get("filter");
  const filter: FilterId = FILTERS.some((f) => f.id === requested) ? (requested as FilterId) : "open";
  const [tracked, setTracked] = useState<TrackedFindingRow[] | null>(null);
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRepositories(), listTrackedFindings()])
      .then(([repos, rows]) => {
        if (cancelled) return;
        setRepositories(repos);
        const own = new Set(repos.filter((r) => !r.is_demo).map((r) => r.id));
        setTracked(rows.filter((r) => own.has(r.repository_id)));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) setUnavailable(true);
        else setError(err instanceof Error ? err.message : "Could not load findings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => (tracked ?? []).filter((t) => matches(filter, t)), [tracked, filter]);
  const repoName = (id: string) => repositories.find((r) => r.id === id)?.name ?? "repository";

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Findings</h1>
          <p>Every flag across your repositories, tracked from the scan that found it to the scan that closed it.</p>
        </div>
      </header>

      {error && <p className="notice notice-error">{error}</p>}
      {unavailable && (
        <div className="empty">
          <h2>Finding tracking isn't enabled here yet.</h2>
          <p>
            This deployment hasn't applied the resolution-history migration. Findings are still listed on each scan — open one
            from <Link to="/repositories">Repositories</Link>.
          </p>
        </div>
      )}

      {tracked && (
        <>
          <div className="filters" role="group" aria-label="Filter findings">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="filter"
                aria-pressed={filter === f.id}
                onClick={() => setParams(f.id === "open" ? {} : { filter: f.id })}
              >
                {f.label}
                <span className="visually-hidden">, {tracked.filter((t) => matches(f.id, t)).length} findings</span>
              </button>
            ))}
          </div>

          <div className="block">
            {visible.length === 0 ? (
              <p className="muted">
                {tracked.length === 0 ? "No findings yet. Scan a repository to start." : "Nothing matches this filter."}
              </p>
            ) : (
              <ul className="rows">
                {visible.map((t) => {
                  const d = describeFinding({ type: t.type, severity: t.severity, evidence_json: t.band ? { band: t.band } : {} });
                  return (
                    <li className="row" key={t.id}>
                      <ToneTag tone={d.tone}>{d.label}</ToneTag>
                      <div className="row-main">
                        {t.last_seen_scan_id && t.latest_finding_id ? (
                          <Link className="row-title" to={`/scans/${t.last_seen_scan_id}/findings/${t.latest_finding_id}`}>
                            {t.file_path ?? t.title}
                          </Link>
                        ) : (
                          <span className="row-title">{t.file_path ?? t.title}</span>
                        )}
                        <span className="row-meta">
                          {repoName(t.repository_id)} · {t.title} · updated {relativeTime(t.updated_at)}
                        </span>
                      </div>
                      <div className="row-side">
                        {t.remediation_pending && <span className="tag tag-quiet">Fix recorded — rescan to verify</span>}
                        <StatusTag status={t.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
