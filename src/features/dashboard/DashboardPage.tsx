import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BitCritter, type BitCritterState } from "../../components/BitCritter";
import { StatusTag, ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { useAuth } from "../auth/AuthContext";
import {
  countScansSince,
  FeatureUnavailableError,
  listBillingEvents,
  listFindingsForScans,
  listLatestScans,
  listRecentResolutions,
  listRepositories,
  listTrackedFindings,
  type ResolutionActivity,
} from "../../lib/api";
import type { RepositoryRow, ScanFindingRow, ScanRow, TrackedFindingRow } from "../../lib/dbTypes";
import { describeFinding, type Tone } from "../../lib/findingVocabulary";
import { HISTORY_LABEL } from "../../lib/resolution";
import { derivePlan, startOfMonth, usageReadout, type UsageReadout } from "../../lib/entitlements";
import { planById } from "../../config/plans";
import { relativeTime, riskTone, RISK_LABEL } from "../../lib/format";

interface DashboardData {
  repositories: RepositoryRow[];
  latestByRepo: Map<string, ScanRow>;
  latestFindings: ScanFindingRow[];
  tracked: TrackedFindingRow[] | null;
  activity: ResolutionActivity[] | null;
  usage: UsageReadout | null;
}

function trackedTone(t: TrackedFindingRow): Tone {
  return describeFinding({ type: t.type, severity: t.severity, evidence_json: t.band ? { band: t.band } : {} }).tone;
}

function trackedLabel(t: TrackedFindingRow): string {
  return describeFinding({ type: t.type, severity: t.severity, evidence_json: t.band ? { band: t.band } : {} }).label;
}

function isCollision(t: Pick<TrackedFindingRow, "band" | "severity">): boolean {
  return t.band === "strong_match" || t.severity === "blocking";
}

export function DashboardPage() {
  useDocumentTitle("Overview — PoryGen");
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [repositories, scans] = await Promise.all([listRepositories(), listLatestScans(80)]);
        const latestByRepo = new Map<string, ScanRow>();
        for (const scan of scans) {
          if (scan.status === "complete" && !latestByRepo.has(scan.repository_id)) latestByRepo.set(scan.repository_id, scan);
        }
        const [latestFindings, tracked, activity, usage] = await Promise.all([
          listFindingsForScans(Array.from(latestByRepo.values()).map((s) => s.id)),
          listTrackedFindings().catch((err) => {
            if (err instanceof FeatureUnavailableError) return null;
            throw err;
          }),
          listRecentResolutions(10).catch((err) => {
            if (err instanceof FeatureUnavailableError) return null;
            throw err;
          }),
          user
            ? Promise.all([listBillingEvents(user.id), countScansSince(user.id, startOfMonth())]).then(([events, scansThisMonth]) =>
                usageReadout(derivePlan(events).plan, scansThisMonth, repositories.filter((r) => !r.is_demo).length),
              )
            : Promise.resolve(null),
        ]);
        if (!cancelled) setData({ repositories, latestByRepo, latestFindings, tracked, activity, usage });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your overview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const view = useMemo(() => {
    if (!data) return null;
    const own = data.repositories.filter((r) => !r.is_demo);
    const ownIds = new Set(own.map((r) => r.id));
    const sample = data.repositories.find((r) => r.is_demo) ?? null;
    const ownLatest = own.map((r) => data.latestByRepo.get(r.id)).filter((s): s is ScanRow => Boolean(s));
    const ownLatestIds = new Set(ownLatest.map((s) => s.id));
    const latestFindings = data.latestFindings.filter((f) => ownLatestIds.has(f.scan_id));

    const clear = ownLatest.reduce((sum, scan) => {
      const s = scan.summary_json?.similarity;
      if (s) return sum + s.clear;
      const flagged = new Set(latestFindings.filter((f) => f.scan_id === scan.id && f.file_path && describeFinding(f).actionable).map((f) => f.file_path));
      return sum + Math.max(0, scan.files_scanned - flagged.size);
    }, 0);

    let review: number;
    let collisions: number;
    let resolved: number | null;
    let open: TrackedFindingRow[] = [];
    if (data.tracked) {
      const mine = data.tracked.filter((t) => ownIds.has(t.repository_id));
      open = mine
        .filter((t) => t.status === "open" || t.status === "in_review")
        .sort((a, b) => Number(isCollision(b)) - Number(isCollision(a)) || b.updated_at.localeCompare(a.updated_at));
      collisions = open.filter(isCollision).length;
      review = open.length - collisions;
      resolved = mine.filter((t) => t.status === "resolved").length;
    } else {
      const actionable = latestFindings.filter((f) => describeFinding(f).actionable);
      collisions = actionable.filter((f) => describeFinding(f).tone === "strong").length;
      review = actionable.length - collisions;
      resolved = null;
    }

    const activity = (data.activity ?? []).filter((a) => ownIds.has(a.repository_id));
    const critter: BitCritterState = collisions > 0 ? "blocking" : review > 0 ? "review" : ownLatest.length > 0 ? "healthy" : "idle";
    return { own, sample, ownLatest, clear, review, collisions, resolved, open, activity, critter, latestFindings };
  }, [data]);

  const repoName = (id: string) => data?.repositories.find((r) => r.id === id)?.name ?? "repository";

  if (error) return <div className="notice notice-error">{error}</div>;
  if (!data || !view) {
    return (
      <div className="page-loading" role="status">
        Loading your overview…
      </div>
    );
  }

  const lastScan = view.ownLatest.map((s) => s.finished_at ?? s.created_at).sort().at(-1);

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>
            <span className="dash-title">
              <BitCritter state={view.critter} size={30} />
              Your codebase today
            </span>
          </h1>
          <p>
            {view.own.length === 0
              ? "Nothing checked yet."
              : `${view.own.length} ${view.own.length === 1 ? "repository" : "repositories"} · last scan ${lastScan ? relativeTime(lastScan) : "not yet run"}`}
            {data.usage && (
              <>
                {" · "}
                {planById(data.usage.plan).name} plan, {data.usage.scansThisMonth} of {data.usage.scansIncluded} scans this month
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/repositories/new" className="btn btn-primary">
            Scan a repo
          </Link>
        </div>
      </header>

      {!data.tracked && view.own.length > 0 && (
        <p className="notice notice-warn block-notice">
          Resolution history isn't enabled on this deployment yet, so these counts come from each repository's latest scan.
        </p>
      )}

      {view.own.length === 0 ? (
        <section className="empty" aria-labelledby="dash-empty">
          <h2 id="dash-empty">Check your first repository.</h2>
          <p>Point PoryGen at a public GitHub repository. You'll see what's clear, what deserves a look, and why.</p>
          <div className="cta-row">
            <Link to="/repositories/new" className="btn btn-primary">
              Scan a repo
            </Link>
            <Link to="/demo" className="link-arrow">
              Or walk through the live demo
            </Link>
          </div>
        </section>
      ) : (
        <>
          <ul className="today" aria-label="Your codebase today">
            <li className="today-item">
              <div className="today-cell">
                <ToneTag tone="clear">Clear changes</ToneTag>
                <span className="today-value">{view.clear}</span>
                <span className="today-hint">Files that passed in each repository's latest scan</span>
              </div>
            </li>
            <li className="today-item">
              <Link className="today-cell" to="/findings?filter=review">
                <ToneTag tone="review">Review suggested</ToneTag>
                <span className="today-value">{view.review}</span>
                <span className="today-hint">Open findings worth a look</span>
              </Link>
            </li>
            <li className="today-item">
              <Link className="today-cell" to="/findings?filter=collisions">
                <ToneTag tone="strong">Open source collisions</ToneTag>
                <span className="today-value">{view.collisions}</span>
                <span className="today-hint">Strong matches and license conflicts</span>
              </Link>
            </li>
            <li className="today-item">
              <Link className="today-cell" to="/findings?filter=resolved">
                <ToneTag tone="neutral">Resolved</ToneTag>
                <span className="today-value">{view.resolved ?? "—"}</span>
                <span className="today-hint">{view.resolved === null ? "Needs resolution history" : "Closed by a clean rescan"}</span>
              </Link>
            </li>
          </ul>

          <section className="block" aria-labelledby="dash-open">
            <div className="block-head">
              <h2 id="dash-open" className="block-title">
                Open findings
              </h2>
              {data.tracked && view.open.length > 0 && (
                <Link to="/findings" className="link-arrow">
                  All findings <ArrowRight aria-hidden="true" size={14} />
                </Link>
              )}
            </div>
            {data.tracked ? (
              view.open.length === 0 ? (
                <p className="muted">Nothing open. Every finding is resolved, accepted, or dismissed.</p>
              ) : (
                <ul className="rows">
                  {view.open.slice(0, 8).map((t) => (
                    <li className="row" key={t.id}>
                      <ToneTag tone={trackedTone(t)}>{trackedLabel(t)}</ToneTag>
                      <div className="row-main">
                        {t.last_seen_scan_id && t.latest_finding_id ? (
                          <Link className="row-title" to={`/scans/${t.last_seen_scan_id}/findings/${t.latest_finding_id}`}>
                            {t.file_path ?? t.title}
                          </Link>
                        ) : (
                          <span className="row-title">{t.file_path ?? t.title}</span>
                        )}
                        <span className="row-meta">
                          {repoName(t.repository_id)} · {t.title}
                        </span>
                      </div>
                      <div className="row-side">
                        {t.remediation_pending && <span className="tag tag-quiet">Fix recorded — rescan to verify</span>}
                        <StatusTag status={t.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <ul className="rows">
                {view.latestFindings
                  .filter((f) => describeFinding(f).actionable)
                  .slice(0, 8)
                  .map((f) => {
                    const d = describeFinding(f);
                    return (
                      <li className="row" key={f.id}>
                        <ToneTag tone={d.tone}>{d.label}</ToneTag>
                        <div className="row-main">
                          <Link className="row-title" to={`/scans/${f.scan_id}/findings/${f.id}`}>
                            {f.file_path ?? f.title}
                          </Link>
                          <span className="row-meta">{f.title}</span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          <section className="block" aria-labelledby="dash-activity">
            <div className="block-head">
              <h2 id="dash-activity" className="block-title">
                Recent activity and resolutions
              </h2>
              {data.activity && (
                <Link to="/history" className="link-arrow">
                  Full history <ArrowRight aria-hidden="true" size={14} />
                </Link>
              )}
            </div>
            {!data.activity ? (
              <p className="muted">Resolution history appears here once it's enabled on this deployment.</p>
            ) : view.activity.length === 0 ? (
              <p className="muted">No activity yet. Findings, decisions, and clean rescans show up here as they happen.</p>
            ) : (
              <ul className="rows">
                {view.activity.map((a) => (
                  <li className="row" key={a.id}>
                    <span className={`tag ${a.to_status === "resolved" ? "tag-clear" : a.actor_kind === "user" ? "tag-neutral" : "tag-quiet"}`}>
                      {HISTORY_LABEL[a.action]}
                    </span>
                    <div className="row-main">
                      <span className="row-title">{a.tracked_findings?.file_path ?? a.tracked_findings?.title ?? "Finding"}</span>
                      <span className="row-meta">
                        {repoName(a.repository_id)} · {a.actor_kind === "user" ? "You" : "PoryGen"}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                    </div>
                    <div className="row-side">
                      <time className="row-meta" dateTime={a.created_at}>
                        {relativeTime(a.created_at)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="block" aria-labelledby="dash-repos">
        <div className="block-head">
          <h2 id="dash-repos" className="block-title">
            Repositories
          </h2>
          <Link to="/repositories" className="link-arrow">
            Manage <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </div>
        <ul className="rows">
          {[...view.own, ...(view.sample ? [view.sample] : [])].map((repo) => {
            const scan = data.latestByRepo.get(repo.id);
            return (
              <li className="row" key={repo.id}>
                {scan?.risk_level ? <ToneTag tone={riskTone(scan.risk_level)}>{RISK_LABEL[scan.risk_level]}</ToneTag> : <span className="tag tag-quiet">Not scanned</span>}
                <div className="row-main">
                  {scan ? (
                    <Link className="row-title" to={`/scans/${scan.id}`}>
                      {repo.name}
                    </Link>
                  ) : (
                    <span className="row-title">{repo.name}</span>
                  )}
                  <span className="row-meta">
                    {repo.is_demo ? "Public sample repository · " : ""}
                    {scan ? `Last scanned ${relativeTime(scan.finished_at ?? scan.created_at)} · ${scan.files_scanned} files` : "No completed scan yet"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
