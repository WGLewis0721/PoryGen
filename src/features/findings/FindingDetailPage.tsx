import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CodeCompare } from "../../components/CodeCompare";
import { EvidenceList } from "../../components/EvidenceList";
import { HistoryList, StageRail, type HistoryEntry } from "../../components/ResolutionTimeline";
import { StatusTag, ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { useAuth } from "../auth/AuthContext";
import {
  FeatureUnavailableError,
  feedRepository,
  getFinding,
  getRepository,
  getScan,
  getTrackedFindingByKey,
  listBillingEvents,
  listFindingResolutions,
  recordFindingAction,
} from "../../lib/api";
import type { FindingResolutionRow, RepositoryRow, ScanFindingRow, ScanRow, TrackedFindingRow } from "../../lib/dbTypes";
import { findingHeadline } from "../../lib/findingVocabulary";
import { ACTIONS, allowedActions, HISTORY_LABEL, stagesFromHistory, type UserAction } from "../../lib/resolution";
import { derivePlan } from "../../lib/entitlements";
import { formatDateTime } from "../../lib/format";
import { formatRanges, LICENSE_MEANING, toEvidenceView, type EvidenceView } from "./evidence";

interface Loaded {
  finding: ScanFindingRow;
  scan: ScanRow;
  repository: RepositoryRow;
}

function WhyItMatters({ view }: { view: EvidenceView }) {
  if (view.similarity && view.source) {
    if (view.descriptor.band === "common_pattern") {
      return (
        <p className="answer">
          Probably nothing. This resembles a textbook idiom that many projects write independently, and the possible source is
          permissively licensed. It's listed so the record is complete.
        </p>
      );
    }
    return (
      <>
        <p className="answer">
          If this code was derived from the possible source, that source's license travels with it. Finding out now takes a few
          minutes; finding out during a customer's security review, a fundraise, or an acquisition costs a great deal more.
        </p>
        <p className="answer">
          Similarity isn't proof of copying — independent work can look alike. That's what the decisions on this page are for.
        </p>
      </>
    );
  }
  if (view.dependency) {
    return (
      <p className="answer">
        Dependencies bring their licenses into your product. {LICENSE_MEANING[view.dependency.policy]} Confirm it fits how you
        distribute, or replace the dependency.
      </p>
    );
  }
  return <p className="answer">Logged for the record.</p>;
}

export function FindingDetailPage() {
  const { scanId, findingId } = useParams<{ scanId: string; findingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tracked, setTracked] = useState<TrackedFindingRow | null>(null);
  const [history, setHistory] = useState<FindingResolutionRow[]>([]);
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);
  const [onFreePlan, setOnFreePlan] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<UserAction | null>(null);
  const [note, setNote] = useState("");
  const [revision, setRevision] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const headline = loaded ? findingHeadline(loaded.finding) : "Finding";
  useDocumentTitle(`${headline} — PoryGen`);

  const loadTracking = useCallback(async (repositoryId: string, key: string | null | undefined) => {
    if (!key) return;
    try {
      const row = await getTrackedFindingByKey(repositoryId, key);
      setTracked(row);
      setHistory(row ? await listFindingResolutions(row.id) : []);
    } catch (err) {
      if (err instanceof FeatureUnavailableError) setTrackingUnavailable(true);
      else throw err;
    }
  }, []);

  useEffect(() => {
    if (!scanId || !findingId) return;
    let cancelled = false;
    (async () => {
      try {
        const [finding, scan] = await Promise.all([getFinding(scanId, findingId), getScan(scanId)]);
        if (!finding || !scan) throw new Error("This finding doesn't exist, or you don't have access to it.");
        const repository = await getRepository(scan.repository_id);
        if (!repository) throw new Error("The repository for this finding is no longer available.");
        if (cancelled) return;
        setLoaded({ finding, scan, repository });
        await loadTracking(repository.id, finding.finding_key);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this finding.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId, findingId, loadTracking]);

  useEffect(() => {
    if (!user) return;
    listBillingEvents(user.id)
      .then((events) => setOnFreePlan(derivePlan(events).plan === "free"))
      .catch(() => setOnFreePlan(true));
  }, [user]);

  if (error) return <p className="notice notice-error">{error}</p>;
  if (!loaded) {
    return (
      <div className="page-loading" role="status">
        Loading finding…
      </div>
    );
  }

  const { finding, scan, repository } = loaded;
  const view = toEvidenceView(finding);
  const isSample = repository.is_demo;
  const canRescan = repository.provider === "github" && !isSample;
  const notLatest = tracked && tracked.latest_finding_id && tracked.latest_finding_id !== finding.id;
  const stages = stagesFromHistory(history);
  const entries: HistoryEntry[] = history.map((h) => ({
    id: h.id,
    label: HISTORY_LABEL[h.action],
    detail: [h.note, h.revision ? `Revision ${h.revision}` : null].filter(Boolean).join(" · ") || null,
    actor: h.actor_kind === "user" ? (h.actor_id === user?.id ? "You" : "A teammate") : "PoryGen",
    at: h.created_at,
    tone: h.actor_kind,
  }));

  function choose(action: UserAction) {
    setActionError(null);
    setFormError(null);
    setNote("");
    setRevision("");
    if (!ACTIONS[action].requiresReason && !ACTIONS[action].acceptsRevision && !ACTIONS[action].reasonPrompt) {
      void submit(action, "", "");
      return;
    }
    setPending(action);
  }

  async function submit(action: UserAction, noteText: string, revisionText: string) {
    if (!tracked) return;
    if (ACTIONS[action].requiresReason && !noteText.trim()) {
      setFormError("A reason is required — it’s kept with the finding.");
      noteRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const updated = await recordFindingAction({ trackedFindingId: tracked.id, action, note: noteText, revision: revisionText });
      setTracked(updated);
      setHistory(await listFindingResolutions(updated.id));
      setPending(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) void submit(pending, note, revision);
  }

  async function rescan() {
    setRescanning(true);
    setActionError(null);
    try {
      const { scanId: next } = await feedRepository(repository.clone_url);
      navigate(`/scans/${next}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start a rescan.");
      setRescanning(false);
    }
  }

  const similarity = view.similarity;
  const source = view.source;

  return (
    <div>
      <Link to={`/scans/${scan.id}`} className="back-link">
        <ArrowLeft aria-hidden="true" /> {repository.name} · scan of {formatDateTime(scan.finished_at ?? scan.created_at)}
      </Link>

      <header className="finding-head">
        <div className="finding-tags">
          <ToneTag tone={view.descriptor.tone}>{view.descriptor.label}</ToneTag>
          {tracked && <StatusTag status={tracked.status} />}
          {isSample && <span className="tag tag-quiet">Public sample repository</span>}
        </div>
        <h1>
          {finding.type === "structural_similarity" && finding.file_path ? (
            <>
              {view.descriptor.band === "strong_match" ? "Strong source match" : view.descriptor.band === "common_pattern" ? "Common pattern" : "Possible source match"} in{" "}
              <span className="mono">{finding.file_path}</span>
            </>
          ) : (
            finding.title
          )}
        </h1>
        <p>
          {repository.name}
          {finding.line_start ? ` · lines ${finding.line_start}–${finding.line_end ?? finding.line_start}` : ""} · found{" "}
          {formatDateTime(finding.created_at)}
        </p>
      </header>

      {notLatest && tracked?.last_seen_scan_id && (
        <p className="notice notice-warn block-notice">
          You're looking at this finding as of an earlier scan.{" "}
          <Link to={`/scans/${tracked.last_seen_scan_id}/findings/${tracked.latest_finding_id}`}>Open the latest version</Link>.
        </p>
      )}

      <div className="finding-wide">
        <section aria-labelledby="q-what">
          <h2 id="q-what" className="question">
            What did PoryGen find?
          </h2>
          {similarity && source ? (
            <p className="answer">
              {similarity.percent} of the structural fingerprints of <strong>{source.title}</strong> appear in{" "}
              <span className="mono">{finding.file_path}</span>
              {similarity.probeLines.length > 0 ? ` (lines ${formatRanges(similarity.probeLines)})` : ""}. The possible source
              carries <strong>{source.license}</strong>.
            </p>
          ) : view.dependency ? (
            <p className="answer">
              {view.dependency.ecosystem === "file"
                ? `A ${view.dependency.license} license file.`
                : `The ${view.dependency.ecosystem} dependency “${view.dependency.name}”${view.dependency.version ? ` (${view.dependency.version})` : ""} is licensed ${view.dependency.license}.`}
            </p>
          ) : (
            <p className="answer">{finding.title}</p>
          )}
        </section>

        {similarity && source && (
          <section aria-labelledby="q-where">
            <h2 id="q-where" className="question">
              Where is it, and what might it resemble?
            </h2>
            {similarity.probeExcerpt && similarity.candidateExcerpt ? (
              <CodeCompare
                left={{
                  label: "Your code",
                  path: `${repository.name}/${finding.file_path}`,
                  meta: similarity.probeLines.length ? `matched: ${formatRanges(similarity.probeLines)}` : undefined,
                  code: similarity.probeExcerpt.text,
                  startLine: similarity.probeExcerpt.startLine,
                  highlight: similarity.probeLines,
                }}
                right={{
                  label: "Possible source",
                  path: [source.repository, source.path].filter(Boolean).join("/") || source.title,
                  meta: similarity.candidateLines.length ? `matched: ${formatRanges(similarity.candidateLines)}` : undefined,
                  code: similarity.candidateExcerpt.text,
                  startLine: similarity.candidateExcerpt.startLine,
                  highlight: similarity.candidateLines,
                }}
              />
            ) : (
              <div className="notice">
                This scan predates side-by-side excerpts, so only the reference source is available. Rescan the repository to
                capture the matched region of your file.
                {similarity.candidateExcerpt && (
                  <pre className="log log-inline">
                    {similarity.candidateExcerpt.text}
                  </pre>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <div className="finding-layout">
        <div className="finding-main">
          {similarity && source && (
            <section aria-labelledby="q-evidence">
              <h2 id="q-evidence" className="question">
                How strong is the evidence?
              </h2>
              <EvidenceList
                items={[
                  {
                    term: "Similarity",
                    detail: (
                      <>
                        <span className="big">{similarity.percent}</span>
                        <span className="sub">
                          {similarity.shared != null && similarity.total != null
                            ? `${similarity.shared} of ${similarity.total} structural fingerprints of the source appear in your file`
                            : "Share of the source's structural fingerprints found in your file"}
                        </span>
                      </>
                    ),
                  },
                  { term: "Band", detail: <>{view.descriptor.label} <span className="sub">Review suggested from 55%; strong source match from 85%.</span></> },
                  { term: "Matched lines", detail: similarity.probeLines.length ? `Yours ${formatRanges(similarity.probeLines)} · source ${formatRanges(similarity.candidateLines)}` : "Not recorded for this scan" },
                  { term: "Why it was flagged", detail: view.why ?? "Structure matched after names, literals, comments, and formatting were normalized away." },
                  { term: "Method", detail: <>Winnowing fingerprints over {similarity.normalizer ?? "lexical"}-normalized tokens<span className="sub">Renaming identifiers or reformatting doesn't change the result.</span></> },
                ]}
              />
            </section>
          )}

          <section aria-labelledby="q-license">
            <h2 id="q-license" className="question">
              What license or context matters?
            </h2>
            {source ? (
              <EvidenceList
                items={[
                  {
                    term: "Possible source",
                    detail: (
                      <>
                        {source.title}
                        <span className="sub">
                          {[source.repository, source.originLabel].filter(Boolean).join(" · ")}
                        </span>
                      </>
                    ),
                  },
                  { term: "License", detail: <>{source.license}<span className="sub">{LICENSE_MEANING[source.licensePolicy] ?? LICENSE_MEANING.UNKNOWN}</span></> },
                  ...(source.commonIdiom ? [{ term: "Idiom", detail: "A widely re-implemented pattern; independent versions often look alike." }] : []),
                ]}
              />
            ) : view.dependency ? (
              <EvidenceList
                items={[
                  { term: view.dependency.ecosystem === "file" ? "File" : "Package", detail: finding.file_path ?? `${view.dependency.name}${view.dependency.version ? ` ${view.dependency.version}` : ""}` },
                  { term: "License", detail: <>{view.dependency.license}<span className="sub">{LICENSE_MEANING[view.dependency.policy] ?? LICENSE_MEANING.UNKNOWN}</span></> },
                  ...(view.dependency.source ? [{ term: "Resolved from", detail: view.dependency.source === "registry-lookup" ? "Package registry" : view.dependency.source }] : []),
                ]}
              />
            ) : (
              <p className="answer muted">No license context for this finding.</p>
            )}
            <p className="fine fine-after">
              License context describes what a license family usually requires. It isn't legal advice.
            </p>
          </section>

          <section aria-labelledby="q-care">
            <h2 id="q-care" className="question">
              Why should you care?
            </h2>
            <WhyItMatters view={view} />
          </section>

          <section aria-labelledby="q-fix">
            <h2 id="q-fix" className="question">
              Did the fix pass?
            </h2>
            {tracked ? (
              <div className="block-stack">
                <StageRail stages={stages} />
                {tracked.remediation_pending && (
                  <p className="notice notice-warn">A fix is recorded. The next scan will verify whether the match is gone.</p>
                )}
                {tracked.status === "resolved" && tracked.resolved_scan_id && (
                  <p className="notice notice-ok">
                    Resolved by a clean rescan. <Link to={`/scans/${tracked.resolved_scan_id}`}>View that scan</Link>.
                  </p>
                )}
                <HistoryList entries={entries} />
              </div>
            ) : trackingUnavailable ? (
              <p className="answer muted">Resolution history isn't enabled on this deployment yet.</p>
            ) : !finding.finding_key ? (
              <p className="answer muted">This finding comes from a scan made before resolution tracking. Rescan to start tracking it.</p>
            ) : (
              <p className="answer muted">Informational findings aren't tracked — there's nothing to resolve.</p>
            )}
          </section>

          <details className="log-details">
            <summary>Technical evidence (raw)</summary>
            <pre className="log">{JSON.stringify(finding.evidence_json ?? {}, null, 2)}</pre>
          </details>
        </div>

        <aside className="finding-aside" aria-label="Actions">
          <div className="panel actions-panel">
            <h2>What do you want to do?</h2>
            {isSample ? (
              <p className="hint">
                This is PoryGen's public sample repository, so actions are turned off. <Link to="/demo">Try the interactive demo</Link>{" "}
                to walk through a fix.
              </p>
            ) : !tracked ? (
              <p className="hint">
                {trackingUnavailable
                  ? "Decisions are available once resolution history is enabled on this deployment."
                  : "Nothing to decide here — this finding isn't actionable or predates tracking."}
              </p>
            ) : pending ? (
              <form className="action-form" onSubmit={onSubmit} noValidate>
                <p className="label">{ACTIONS[pending].label}</p>
                <p className="hint">{ACTIONS[pending].description}</p>
                <div className="field">
                  <label className="label" htmlFor="action-note">
                    {ACTIONS[pending].reasonPrompt ?? "Note"}
                  </label>
                  <textarea
                    id="action-note"
                    ref={noteRef}
                    name="note"
                    autoComplete="off"
                    className="textarea"
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setFormError(null);
                    }}
                    maxLength={2000}
                    aria-invalid={formError ? true : undefined}
                    aria-describedby={formError ? "action-note-error" : undefined}
                    autoFocus
                  />
                  {formError && (
                    <p id="action-note-error" className="field-error" role="alert">
                      {formError}
                    </p>
                  )}
                </div>
                {ACTIONS[pending].acceptsRevision && (
                  <div className="field">
                    <label className="label" htmlFor="action-revision">
                      Commit or revision (optional)
                    </label>
                    <input id="action-revision" name="revision" autoComplete="off" spellCheck={false} className="input mono" value={revision} maxLength={120} onChange={(e) => setRevision(e.target.value)} />
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? "Saving…" : ACTIONS[pending].label}
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setPending(null)} disabled={busy}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                {allowedActions(tracked.status)
                  .filter((a) => a !== "note")
                  .map((action, index) => (
                    <button
                      key={action}
                      type="button"
                      className={`btn btn-block ${index === 0 ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => choose(action)}
                      disabled={busy}
                    >
                      {ACTIONS[action].label}
                    </button>
                  ))}
                <button type="button" className="btn btn-ghost btn-block" onClick={() => choose("note")} disabled={busy}>
                  Add a note
                </button>
              </>
            )}
            {actionError && (
              <p className="notice notice-error" role="alert">
                {actionError}
              </p>
            )}
            {canRescan && (
              <button type="button" className="btn btn-secondary btn-block" onClick={rescan} disabled={rescanning}>
                <RefreshCw aria-hidden="true" />
                {rescanning ? "Starting rescan…" : "Rescan repository"}
              </button>
            )}
            {tracked && onFreePlan && !isSample && (
              <p className="hint">The resolution workflow is part of Pro. It's included for every account during early access.</p>
            )}
          </div>

          {view.coverage && (
            <div className="coverage-box">
              <strong>Compared against {view.coverage.providerName}.</strong> {view.coverage.claim}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
