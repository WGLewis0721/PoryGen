import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, RotateCcw, ScanSearch } from "lucide-react";
import type { FindingDraft, PipelineResult } from "@porygen/provenance-core";
import { CodeCompare } from "../../components/CodeCompare";
import { EvidenceList } from "../../components/EvidenceList";
import { HistoryList, StageRail, type HistoryEntry } from "../../components/ResolutionTimeline";
import { StatusTag, ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { useAuth } from "../auth/AuthContext";
import { describeFinding } from "../../lib/findingVocabulary";
import { HISTORY_LABEL, stagesFromHistory } from "../../lib/resolution";
import type { ResolutionAction, TrackedStatus } from "../../lib/dbTypes";
import { formatRanges, LICENSE_MEANING, spanOf, toEvidenceView } from "../findings/evidence";
import { compareToSample, runSampleScan } from "./sampleEngine";
import { RATE_LIMIT_AFTER, RATE_LIMIT_PATH, SAMPLE_FILES_BEFORE, SAMPLE_REPOSITORY, simulatedPaths } from "./sampleRepo";
import "./demo.css";

type Phase = "intro" | "scanning" | "summary" | "finding" | "decision-form" | "decided" | "fixing" | "rescanning" | "resolved";
type Decision = "dismissed_false_positive" | "accepted_risk";

interface DemoEvent {
  id: string;
  action: ResolutionAction;
  actor_kind: "user" | "system";
  to_status: TrackedStatus;
  created_at: string;
  detail: string | null;
}

const STEP_LABELS = ["Scan", "Inspect", "Fix", "Rescan", "Resolved"];
const PHASE_STEP: Record<Phase, number> = {
  intro: 0,
  scanning: 0,
  summary: 1,
  finding: 1,
  "decision-form": 1,
  decided: 1,
  fixing: 2,
  rescanning: 3,
  resolved: 5,
};

const SIMULATED = simulatedPaths(SAMPLE_REPOSITORY.totalFiles - SAMPLE_FILES_BEFORE.length);
const SCAN_PATHS = [...SIMULATED.slice(0, 150), ...SAMPLE_FILES_BEFORE.map((f) => f.path), ...SIMULATED.slice(150)];
const SCAN_PHASES = ["Reading files", "Normalizing structure", "Fingerprinting", "Comparing with sources", "Checking licenses"];

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

/** File-level counts for the whole sample repository: engine results for real files, simulated files counted clear. */
function repoCounts(result: PipelineResult) {
  const s = result.summary.similarity;
  const simulatedClear = SAMPLE_REPOSITORY.totalFiles - (s.clear + s.commonPattern + s.reviewSuggested + s.strongMatch);
  return { clear: s.clear + simulatedClear, common: s.commonPattern, review: s.reviewSuggested, strong: s.strongMatch };
}

function similarityFindings(result: PipelineResult | null): FindingDraft[] {
  if (!result) return [];
  const rank = { strong_match: 0, review_suggested: 1, common_pattern: 2 } as Record<string, number>;
  return result.findings
    .filter((f) => f.type === "structural_similarity")
    .sort((a, b) => (rank[String(a.evidence_json.band)] ?? 9) - (rank[String(b.evidence_json.band)] ?? 9));
}

let eventSeq = 0;
function makeEvent(action: ResolutionAction, actor: "user" | "system", to: TrackedStatus, detail: string | null = null): DemoEvent {
  eventSeq += 1;
  return { id: `demo-${eventSeq}`, action, actor_kind: actor, to_status: to, created_at: new Date().toISOString(), detail };
}

function Counts({ counts, label }: { counts: ReturnType<typeof repoCounts>; label: string }) {
  return (
    <dl className="demo-counts" aria-label={label}>
      <div>
        <dt><ToneTag tone="clear">Clear</ToneTag></dt>
        <dd>{counts.clear}</dd>
      </div>
      <div>
        <dt><ToneTag tone="common">Common pattern</ToneTag></dt>
        <dd>{counts.common}</dd>
      </div>
      <div>
        <dt><ToneTag tone="review">Review suggested</ToneTag></dt>
        <dd>{counts.review}</dd>
      </div>
      <div>
        <dt><ToneTag tone="strong">Strong source match</ToneTag></dt>
        <dd>{counts.strong}</dd>
      </div>
    </dl>
  );
}

export function DemoPage() {
  useDocumentTitle("Live demo — PoryGen");
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("intro");
  const [before, setBefore] = useState<PipelineResult | null>(null);
  const [after, setAfter] = useState<PipelineResult | null>(null);
  const [afterScore, setAfterScore] = useState<number | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [status, setStatus] = useState<TrackedStatus>("open");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ index: 0, label: SCAN_PHASES[0] });
  const [announcement, setAnnouncement] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // Move focus to the new panel's heading when the panel changes — but not for the
  // reason form or its outcome, which stay inside the finding view.
  const panel = phase === "decision-form" || phase === "decided" ? "finding" : phase;
  useEffect(() => {
    if (panel !== "intro") headingRef.current?.focus();
  }, [panel]);

  const strong = useMemo(() => similarityFindings(before).find((f) => f.evidence_json.band === "strong_match") ?? null, [before]);
  const view = useMemo(() => (strong ? toEvidenceView({ ...strong, confidence: strong.confidence }) : null), [strong]);

  const animate = useCallback(
    (paths: string[], durationMs: number, onDone: () => void) => {
      clearTimers();
      if (prefersReducedMotion()) {
        setProgress({ index: paths.length, label: SCAN_PHASES[SCAN_PHASES.length - 1] });
        timers.current.push(window.setTimeout(onDone, 250));
        return;
      }
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        timers.current.push(
          window.setTimeout(() => {
            const index = Math.round((i / steps) * paths.length);
            setProgress({ index, label: SCAN_PHASES[Math.min(SCAN_PHASES.length - 1, Math.floor((i / steps) * SCAN_PHASES.length))] });
          }, (durationMs / steps) * i),
        );
      }
      timers.current.push(window.setTimeout(onDone, durationMs + 250));
    },
    [clearTimers],
  );

  function runScan() {
    setPhase("scanning");
    setProgress({ index: 0, label: SCAN_PHASES[0] });
    setAnnouncement("Scanning the sample change.");
    const result = runSampleScan("before");
    animate(SCAN_PATHS, 2600, async () => {
      const r = await result;
      setBefore(r);
      setEvents([makeEvent("detected", "system", "open", `Scan of ${SAMPLE_REPOSITORY.commit}`)]);
      setStatus("open");
      setPhase("summary");
      const c = repoCounts(r);
      setAnnouncement(`Scan complete. ${SAMPLE_REPOSITORY.totalFiles} files checked: ${c.strong} strong source match, ${c.review} review suggested.`);
    });
  }

  function startReview() {
    setEvents((prev) => [...prev, makeEvent("review_started", "user", "in_review")]);
    setStatus("in_review");
    setAnnouncement("Review started. The finding is now in review.");
  }

  function openDecision(next: Decision) {
    setDecision(next);
    setReason("");
    setReasonError(null);
    setPhase("decision-form");
  }

  function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!decision) return;
    if (!reason.trim()) {
      setReasonError("A reason is required — it’s kept with the finding.");
      reasonRef.current?.focus();
      return;
    }
    setEvents((prev) => [...prev, makeEvent(decision, "user", decision, reason.trim())]);
    setStatus(decision);
    setPhase("decided");
    setAnnouncement(decision === "accepted_risk" ? "Risk accepted and recorded." : "Dismissed as a false positive and recorded.");
  }

  function tryFixInstead() {
    setEvents((prev) => [...prev, makeEvent("reopened", "user", "open", "Reopened to try the fix path")]);
    setStatus("open");
    setDecision(null);
    setPhase("finding");
  }

  function recordFixAndRescan() {
    setEvents((prev) => [...prev, makeEvent("remediation_recorded", "user", "in_review", `Replacement in ${SAMPLE_REPOSITORY.fixCommit}`)]);
    setStatus("in_review");
    setPhase("rescanning");
    setProgress({ index: 0, label: SCAN_PHASES[0] });
    setAnnouncement("Fix recorded. Rescanning.");
    const result = Promise.all([runSampleScan("after"), compareToSample(RATE_LIMIT_PATH, RATE_LIMIT_AFTER, "sample-slidewindow")]);
    animate(SCAN_PATHS, 1600, async () => {
      const [r, score] = await result;
      setAfter(r);
      setAfterScore(score);
      const stillThere = similarityFindings(r).some((f) => f.file_path === RATE_LIMIT_PATH && f.evidence_json.band !== "common_pattern");
      if (stillThere) {
        setEvents((prev) => [...prev, makeEvent("rescan_still_detected", "system", "in_review", "The rescan still detects this match.")]);
        setPhase("finding");
        return;
      }
      setEvents((prev) => [
        ...prev,
        makeEvent("rescan_clean", "system", "resolved", `Re-checked ${RATE_LIMIT_PATH}; similarity is now ${pct(score)}, below the reporting threshold.`),
      ]);
      setStatus("resolved");
      setPhase("resolved");
      setAnnouncement("Rescan complete. The match is gone and the finding is resolved.");
    });
  }

  function restart() {
    clearTimers();
    setBefore(null);
    setAfter(null);
    setAfterScore(null);
    setEvents([]);
    setStatus("open");
    setDecision(null);
    setPhase("intro");
    setAnnouncement("Demo reset.");
  }

  const historyEntries: HistoryEntry[] = events.map((e) => ({
    id: e.id,
    label: HISTORY_LABEL[e.action],
    detail: e.detail,
    actor: e.actor_kind === "user" ? "You" : "PoryGen",
    at: e.created_at,
    tone: e.actor_kind,
  }));
  const stages = stagesFromHistory(events);
  const currentStep = PHASE_STEP[phase];
  const probeSpan = view?.similarity ? spanOf(view.similarity.probeLines) : null;
  const candidateSpan = view?.similarity ? spanOf(view.similarity.candidateLines) : null;

  return (
    <div className="demo">
      <div className="demo-banner">
        <div className="shell demo-banner-inner">
          <span className="demo-badge">Sample interactive demo</span>
          <span>Fictional repository and sources. Scores are computed live, in your browser, by PoryGen's matching engine.</span>
        </div>
      </div>

      <div className="shell demo-frame">
        <h1 className="visually-hidden">PoryGen live demo</h1>
        <ol className="demo-steps" aria-label="Demo progress">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={i < currentStep ? "is-done" : i === currentStep ? "is-current" : ""} aria-current={i === currentStep ? "step" : undefined}>
              <span className="demo-step-num">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>

        {phase === "intro" && (
          <section className="demo-panel demo-intro" aria-labelledby="demo-title">
            <h2 id="demo-title" className="display demo-title">
              Watch PoryGen check what an AI agent wrote.
            </h2>
            <p className="lede">
              Lattice — a fictional SaaS team — asked their coding agent to add API rate limiting. The agent committed{" "}
              <code className="mono">{SAMPLE_REPOSITORY.commit}</code>, “{SAMPLE_REPOSITORY.commitMessage}.” Run PoryGen on the
              change and follow one finding from flag to fix.
            </p>
            <div className="demo-intro-meta">
              <span>
                Repository <strong className="mono">{SAMPLE_REPOSITORY.name}</strong>
              </span>
              <span>
                Branch <strong className="mono">{SAMPLE_REPOSITORY.branch}</strong>
              </span>
              <span>
                {SAMPLE_REPOSITORY.totalFiles} files · about 90 seconds
              </span>
            </div>
            <button type="button" className="btn btn-primary demo-run" onClick={runScan}>
              <ScanSearch aria-hidden="true" />
              Run sample scan
            </button>
          </section>
        )}

        {(phase === "scanning" || phase === "rescanning") && (
          <section className="demo-panel" aria-labelledby="demo-scan-title">
            <h2 id="demo-scan-title" ref={headingRef} tabIndex={-1} className="display demo-heading">
              {phase === "scanning" ? "Checking the new code…" : `Rescanning ${SAMPLE_REPOSITORY.fixCommit}…`}
            </h2>
            <div className="demo-progress" aria-hidden="true">
              <div className="demo-progress-bar" style={{ transform: `scaleX(${progress.index / SCAN_PATHS.length})` }} />
            </div>
            <div className="demo-scan-readout">
              <span className="demo-scan-phase">{progress.label}</span>
              <span className="demo-scan-count">
                {Math.min(progress.index, SCAN_PATHS.length)} / {SCAN_PATHS.length} files
              </span>
            </div>
            <p className="demo-scan-path mono" aria-hidden="true">
              {SCAN_PATHS[Math.min(Math.max(progress.index - 1, 0), SCAN_PATHS.length - 1)]}
            </p>
          </section>
        )}

        {phase === "summary" && before && (
          <section className="demo-panel" aria-labelledby="demo-summary-title">
            <h2 id="demo-summary-title" ref={headingRef} tabIndex={-1} className="display demo-heading">
              {SAMPLE_REPOSITORY.totalFiles} files checked. One strong source match.
            </h2>
            <Counts counts={repoCounts(before)} label="Scan results" />
            <ul className="demo-findings" aria-label="Findings">
              {similarityFindings(before).map((f) => {
                const d = describeFinding(f);
                const isStrong = f.evidence_json.band === "strong_match";
                return (
                  <li key={f.finding_key} className={isStrong ? "is-primary" : ""}>
                    <ToneTag tone={d.tone}>{d.label}</ToneTag>
                    <span className="mono demo-finding-path">{f.file_path}</span>
                    <span className="demo-finding-score">{pct(f.evidence_json.containment as number)}</span>
                    <span className="demo-finding-license">{(f.evidence_json.candidate as { license: string }).license}</span>
                    {isStrong ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setPhase("finding")}>
                        Open finding <ArrowRight aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="demo-finding-note">{d.band === "common_pattern" ? "Informational" : "Queued for review"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="fine demo-coverage">
              {view?.coverage?.claim} {SAMPLE_REPOSITORY.totalFiles - SAMPLE_FILES_BEFORE.length} of the sample's files are
              simulated as clear.
            </p>
          </section>
        )}

        {(phase === "finding" || phase === "decision-form" || phase === "decided") && strong && view?.similarity && view.source && (
          <section className="demo-panel" aria-labelledby="demo-finding-title">
            <header className="demo-finding-head">
              <div className="demo-finding-tags">
                <ToneTag tone="strong">Strong source match</ToneTag>
                <StatusTag status={status} />
              </div>
              <h2 id="demo-finding-title" ref={headingRef} tabIndex={-1} className="display demo-heading">
                Strong source match in <span className="mono demo-heading-path">{RATE_LIMIT_PATH}</span>
              </h2>
            </header>

            <CodeCompare
              left={{
                label: "Your code",
                path: `${SAMPLE_REPOSITORY.name}/${RATE_LIMIT_PATH}`,
                meta: probeSpan ? `matched: lines ${formatRanges(view.similarity.probeLines)}` : undefined,
                code: view.similarity.probeExcerpt?.text ?? "",
                startLine: view.similarity.probeExcerpt?.startLine ?? 1,
                highlight: view.similarity.probeLines,
              }}
              right={{
                label: "Possible source",
                path: `${view.source.repository}/${view.source.path}`,
                meta: candidateSpan ? `matched: lines ${formatRanges(view.similarity.candidateLines)}` : undefined,
                code: view.similarity.candidateExcerpt?.text ?? "",
                startLine: view.similarity.candidateExcerpt?.startLine ?? 1,
                highlight: view.similarity.candidateLines,
              }}
            />

            <div className="demo-finding-grid">
              <EvidenceList
                items={[
                  {
                    term: "Similarity",
                    detail: (
                      <>
                        <span className="big">{view.similarity.percent}</span>
                        <span className="sub">
                          {view.similarity.shared} of {view.similarity.total} structural fingerprints shared
                        </span>
                      </>
                    ),
                  },
                  {
                    term: "Possible source",
                    detail: (
                      <>
                        {view.source.title}
                        <span className="sub">
                          {view.source.repository} · {view.source.originLabel}
                        </span>
                      </>
                    ),
                  },
                  {
                    term: "License",
                    detail: (
                      <>
                        {view.source.license}
                        <span className="sub">{LICENSE_MEANING[view.source.licensePolicy]}</span>
                      </>
                    ),
                  },
                  { term: "Why it was flagged", detail: view.why },
                  { term: "Compared against", detail: view.coverage?.claim },
                ]}
              />

              <aside className="demo-actions" aria-labelledby="demo-actions-title">
                <h3 id="demo-actions-title" className="demo-actions-title">
                  What do you want to do?
                </h3>

                {phase === "finding" && (
                  <>
                    <button type="button" className="btn btn-primary btn-block" onClick={() => setPhase("fixing")}>
                      Replace it — simulate the fix
                    </button>
                    <p className="demo-actions-hint">Recommended for this walkthrough.</p>
                    <button type="button" className="btn btn-secondary btn-block" onClick={startReview} disabled={status !== "open"}>
                      {status === "open" ? "Start review" : "In review"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-block" onClick={() => openDecision("dismissed_false_positive")}>
                      Dismiss as false positive
                    </button>
                    <button type="button" className="btn btn-secondary btn-block" onClick={() => openDecision("accepted_risk")}>
                      Accept the risk
                    </button>
                  </>
                )}

                {phase === "decision-form" && decision && (
                  <form className="demo-decision" onSubmit={submitDecision} noValidate>
                    <div className="field">
                      <label className="label" htmlFor="demo-reason">
                        {decision === "accepted_risk" ? "Why is this risk acceptable?" : "Why is this a false positive?"}
                      </label>
                      <textarea
                        id="demo-reason"
                        ref={reasonRef}
                        name="reason"
                        autoComplete="off"
                        className="textarea"
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          setReasonError(null);
                        }}
                        aria-invalid={reasonError ? true : undefined}
                        aria-describedby={reasonError ? "demo-reason-error" : "demo-reason-hint"}
                        autoFocus
                      />
                      {reasonError ? (
                        <p id="demo-reason-error" className="field-error" role="alert">
                          {reasonError}
                        </p>
                      ) : (
                        <p id="demo-reason-hint" className="hint">
                          Required. It stays with the finding in its history.
                        </p>
                      )}
                    </div>
                    <button type="submit" className="btn btn-primary btn-block">
                      {decision === "accepted_risk" ? "Accept the risk" : "Dismiss"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-block" onClick={() => setPhase("finding")}>
                      Cancel
                    </button>
                  </form>
                )}

                {phase === "decided" && (
                  <div className="demo-decided">
                    <p>
                      {status === "accepted_risk"
                        ? "Recorded. The finding stays accepted across rescans, with your reason attached."
                        : "Recorded. The finding stays dismissed across rescans, with your note attached."}
                    </p>
                    <button type="button" className="btn btn-primary btn-block" onClick={tryFixInstead}>
                      Try the fix path instead
                    </button>
                  </div>
                )}

                <div className="demo-history">
                  <h4 className="label-caps">Resolution history</h4>
                  <HistoryList entries={historyEntries} />
                </div>
              </aside>
            </div>
          </section>
        )}

        {phase === "fixing" && (
          <section className="demo-panel" aria-labelledby="demo-fix-title">
            <h2 id="demo-fix-title" ref={headingRef} tabIndex={-1} className="display demo-heading">
              The replacement, in <span className="mono demo-heading-path">{SAMPLE_REPOSITORY.fixCommit}</span>
            </h2>
            <p className="lede">
              “{SAMPLE_REPOSITORY.fixMessage}.” A different design: a fixed-window counter on the app's own cache instead of an
              in-memory sliding window.
            </p>
            <figure className="demo-code-single">
              <figcaption className="cc-head">
                <span className="cc-label">Your code — after</span>
                <span className="cc-path mono">
                  {SAMPLE_REPOSITORY.name}/{RATE_LIMIT_PATH}
                </span>
              </figcaption>
              <pre className="cc-code" tabIndex={0} aria-label="Replacement code">
                <code>
                  {RATE_LIMIT_AFTER.split("\n").map((line, i) => (
                    <span className="cc-line" key={i}>
                      <span className="cc-num" aria-hidden="true">
                        {String(i + 1).padStart(2, " ")}
                      </span>
                      <span className="cc-text">{line || " "}</span>
                    </span>
                  ))}
                </code>
              </pre>
            </figure>
            <div className="cta-row">
              <button type="button" className="btn btn-primary" onClick={recordFixAndRescan}>
                <RefreshCw aria-hidden="true" />
                Record fix and rescan
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPhase("finding")}>
                Back to the finding
              </button>
            </div>
          </section>
        )}

        {phase === "resolved" && before && after && (
          <section className="demo-panel" aria-labelledby="demo-resolved-title">
            <div className="demo-finding-tags">
              <StatusTag status="resolved" />
            </div>
            <h2 id="demo-resolved-title" ref={headingRef} tabIndex={-1} className="display demo-heading">
              The match is gone. Resolved.
            </h2>
            <div className="demo-delta" aria-label="Similarity before and after the fix">
              <div>
                <span className="label-caps">Before · {SAMPLE_REPOSITORY.commit}</span>
                <span className="demo-delta-value demo-delta-before">{view?.similarity?.percent}</span>
              </div>
              <ArrowRight aria-hidden="true" className="demo-delta-arrow" />
              <div>
                <span className="label-caps">After · {SAMPLE_REPOSITORY.fixCommit}</span>
                <span className="demo-delta-value demo-delta-after">{pct(afterScore)}</span>
              </div>
              <p className="demo-delta-note">Below the 55% reporting threshold, so the finding closed itself on the rescan.</p>
            </div>
            <Counts counts={repoCounts(after)} label="Rescan results" />
            <div className="demo-resolved-history">
              <h3 className="label-caps">Resolution history</h3>
              <StageRail stages={stages} />
              <HistoryList entries={historyEntries} />
            </div>
          </section>
        )}

        {phase === "resolved" && (
          <section className="demo-end" aria-labelledby="demo-end-title">
            <h2 id="demo-end-title" className="display">
              Want PoryGen watching your real repo?
            </h2>
            <div className="cta-row">
              <Link to={user ? "/repositories/new" : "/sign-up"} className="btn btn-primary">
                Scan your repo
              </Link>
              <button type="button" className="btn btn-ghost" onClick={restart}>
                <RotateCcw aria-hidden="true" />
                Run the demo again
              </button>
            </div>
          </section>
        )}

        {phase !== "intro" && phase !== "resolved" && (
          <p className="demo-restart">
            <button type="button" className="btn btn-ghost btn-sm" onClick={restart}>
              <RotateCcw aria-hidden="true" />
              Start over
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
