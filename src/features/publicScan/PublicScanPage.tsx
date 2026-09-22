import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, ScanSearch } from "lucide-react";
import { CodeCompare } from "../../components/CodeCompare";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { getTermsAcceptance } from "../legal/termsAcceptance";
import type { Finding, Range, ScanResult } from "./types";
import "./public-scan.css";

type Decision = { status: "reviewing" | "dismissed"; reason?: string; at: string };
type Decisions = Record<string, Decision>;

const EXAMPLES = ["https://github.com/sindresorhus/yocto-queue", "https://github.com/sindresorhus/is-plain-obj"];

const DISMISS_REASONS = [
  "Common pattern, not a concern",
  "We wrote this ourselves",
  "License is compatible with our use",
  "Attribution added",
];

const REASON_LABELS: Record<string, string> = {
  file_too_large: "over 100 KB",
  decoded_file_too_large: "over 100 KB",
  file_limit: "beyond the 150-file limit",
  total_byte_limit: "beyond the 2 MB limit",
  time_limit: "not reached in time",
  provider_failure: "failed to download",
};

const storageKey = (repo: string) => `porygen.scan.${repo.toLowerCase()}`;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: decisions last for this page view only */
  }
}

const isMatch = (f: Finding) => f.classification !== "insufficient_evidence" && f.publicSource !== null;

// Mirrors labs/source-search-lab/public/resolution.mjs: a finding only counts as
// resolved on a new commit if its file was actually rechecked or confirmed deleted.
function resolvedSince(previous: ScanResult | null, next: ScanResult | null): Finding[] {
  if (!previous || !next) return [];
  if (previous.repository.name !== next.repository.name || previous.repository.commit === next.repository.commit) return [];
  const nextIds = new Set(next.findings.filter(isMatch).map((f) => f.id));
  const checked = new Set(next.scan.checkedFiles);
  const inTree = new Set(next.scan.supportedFilesInTree);
  return previous.findings.filter(isMatch).filter((f) => {
    if (nextIds.has(f.id)) return false;
    return checked.has(f.customer.path) || (next.scan.treeComplete && !inTree.has(f.customer.path));
  });
}

const lineLabel = (r: Range | null) => (!r ? "" : r.start === r.end ? `line ${r.start}` : `lines ${r.start}–${r.end}`);
const pct = (v = 0) => `${Math.round(v * 100)}%`;
const sourceHref = (f: Finding) => {
  const s = f.publicSource!;
  if (!s.lines) return s.url;
  try {
    const host = new URL(s.url).hostname.toLowerCase();
    return host === "github.com" ? `${s.url}#L${s.lines.start}-L${s.lines.end}` : s.url;
  } catch {
    return s.url;
  }
};

function FindingCard({ finding, decision, onDecide }: { finding: Finding; decision?: Decision; onDecide: (d: Decision | null) => void }) {
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const strong = finding.classification === "strong_match";
  const source = finding.publicSource!;
  const dismissed = decision?.status === "dismissed";

  return (
    <li className={`ps-finding${strong ? " is-strong" : ""}${dismissed ? " is-dismissed" : ""}`}>
      <div className="ps-finding-head">
        <span className={`tag ${strong ? "tag-strong" : "tag-common"}`}>{strong ? "Strong match" : "Possible / common pattern"}</span>
        {decision && <span className="tag tag-neutral">{dismissed ? `Dismissed: ${decision.reason}` : "In review"}</span>}
      </div>
      <h3 className="ps-finding-title">
        <span className="mono">{finding.customer.path}</span> {lineLabel(finding.customer.lines)} resembles{" "}
        <a href={sourceHref(finding)} target="_blank" rel="noreferrer" className="mono">
          {source.repository}/{source.path}
        </a>
      </h3>
      <p className="ps-explain">{finding.explanation}</p>
      <dl className="ps-facts">
        <div>
          <dt>Source license</dt>
          <dd>{source.licenseUrl ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a> : source.license}</dd>
        </div>
        {finding.metrics && (
          <>
            <div><dt>Your file matched</dt><dd>{pct(finding.metrics.customerCoverage)}</dd></div>
            <div><dt>Source matched</dt><dd>{pct(finding.metrics.sourceCoverage)}</dd></div>
            <div><dt>Longest identical run</dt><dd>{finding.metrics.contiguousTokens} tokens</dd></div>
          </>
        )}
      </dl>

      {!dismissed && finding.customer.lines && source.lines && (
        <CodeCompare
          left={{
            label: "Your code",
            path: finding.customer.path,
            code: finding.customer.excerpt,
            startLine: Math.max(1, finding.customer.lines.start - 1),
            highlight: [finding.customer.lines],
          }}
          right={{
            label: "Public source",
            path: `${source.repository}/${source.path}`,
            meta: `@ ${source.commit.slice(0, 7)} · ${source.license}`,
            code: source.excerpt,
            startLine: Math.max(1, source.lines.start - 1),
            highlight: [source.lines],
          }}
        />
      )}

      <div className="ps-actions">
        <a
          className="btn btn-secondary btn-sm"
          href={sourceHref(finding)}
          target="_blank"
          rel="noreferrer"
          onClick={() => !decision && onDecide({ status: "reviewing", at: new Date().toISOString() })}
        >
          Open the source <ExternalLink aria-hidden="true" />
        </a>
        {dismissed ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDecide(null)}>Reopen</button>
        ) : (
          <span className="ps-dismiss">
            <label className="visually-hidden" htmlFor={`reason-${finding.id}`}>Dismiss reason</label>
            <select id={`reason-${finding.id}`} className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
              {DISMISS_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDecide({ status: "dismissed", reason, at: new Date().toISOString() })}>
              Dismiss
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

export function PublicScanPage() {
  useDocumentTitle("Scan a public repository");
  const [params, setParams] = useSearchParams();
  const repoParam = params.get("repo") ?? "";
  const [input, setInput] = useState(repoParam);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [previous, setPrevious] = useState<ScanResult | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastRun = useRef("");
  const current = useRef<ScanResult | null>(null);

  const run = useCallback(async (url: string, isRescan: boolean) => {
    setBusy(true);
    setError("");
    if (!isRescan) setResult(null);
    try {
      const acceptance = getTermsAcceptance();
      if (!acceptance) throw new Error("Accept the current Terms of Use before scanning.");
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          repositoryUrl: url,
          termsVersion: acceptance.version,
          termsAcceptedAt: acceptance.acceptedAt,
        }),
      });
      const data = await response.json().catch(() => ({ error: "The scanner is unavailable right now. Try again shortly." }));
      if (!response.ok) throw new Error(data.error || "Scan failed.");
      const next = data as ScanResult;
      const stored = load<{ scan: ScanResult; decisions: Decisions }>(storageKey(next.repository.name));
      const kept = stored?.decisions ?? {};
      setPrevious(isRescan ? current.current : stored?.scan ?? null);
      setDecisions(kept);
      setResult(next);
      current.current = next;
      save(storageKey(next.repository.name), { scan: next, decisions: kept });
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (repoParam && lastRun.current !== repoParam) {
      lastRun.current = repoParam;
      setInput(repoParam);
      void run(repoParam, false);
    }
  }, [repoParam, run]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    if (url === repoParam) void run(url, false);
    else setParams({ repo: url });
  }

  function decide(id: string, d: Decision | null) {
    if (!result) return;
    const next = { ...decisions };
    if (d) next[id] = d;
    else delete next[id];
    setDecisions(next);
    save(storageKey(result.repository.name), { scan: result, decisions: next });
  }

  const matches = result?.findings.filter(isMatch) ?? [];
  const strong = matches.filter((f) => f.classification === "strong_match");
  const possible = matches.filter((f) => f.classification !== "strong_match");
  const openCount = strong.filter((f) => decisions[f.id]?.status !== "dismissed").length;
  const resolved = resolvedSince(previous, result);
  const sameCommit = previous && result && previous.repository.commit === result.repository.commit;
  const incomplete = result
    ? Object.entries(result.scan.incompleteReasons ?? {}).map(([k, n]) => `${n} ${n === 1 ? "file" : "files"} ${REASON_LABELS[k] ?? k.replaceAll("_", " ")}`)
    : [];

  return (
    <div className="ps shell">
      <header className="ps-intro">
        <h1 className="display ps-title">Scan a public GitHub repository</h1>
        <p className="lede">
          PoryGen fetches the latest commit, compares its JavaScript, TypeScript and Python against indexed public sources, and
          shows any code that closely matches — with the source, its license, and the exact lines.
        </p>
      </header>

      <form className="ps-form" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="repo-url">Public repository URL</label>
          <div className="ps-row">
            <input
              id="repo-url"
              className="input mono"
              type="url"
              inputMode="url"
              placeholder="https://github.com/owner/repo"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <ScanSearch aria-hidden="true" /> {busy ? "Scanning…" : "Scan"}
            </button>
          </div>
          <p className="hint">
            No account needed. Source code is analyzed transiently and isn’t stored on PoryGen’s servers. Scan results may be saved in this browser. Try{" "}
            {EXAMPLES.map((ex, i) => (
              <span key={ex}>
                {i > 0 && " or "}
                <button type="button" className="ps-linkbtn mono" onClick={() => setInput(ex)}>
                  {ex.replace("https://github.com/", "")}
                </button>
              </span>
            ))}
            .
          </p>
        </div>
      </form>

      <div role="status" aria-live="polite">
        {busy && <p className="notice">Fetching the repository and checking it against indexed sources. This usually takes a few seconds; larger repositories can take longer…</p>}
        {error && !busy && (
          <p className="notice notice-error">
            <strong>Scan didn’t run.</strong> {error}
          </p>
        )}
      </div>

      {result && (
        <section className="ps-result" aria-labelledby="ps-result-title">
          <h2 id="ps-result-title" ref={headingRef} tabIndex={-1} className="display ps-heading">
            {`${result.scan.fetchedFiles} files checked. `}
            {strong.length === 0
              ? "No strong source match."
              : openCount === 0
                ? `${strong.length} strong source ${strong.length === 1 ? "match" : "matches"}, all dismissed.`
                : `${strong.length} strong source ${strong.length === 1 ? "match" : "matches"} to review.`}
          </h2>
          <p className="ps-meta">
            <a href={result.repository.url} target="_blank" rel="noreferrer" className="mono">{result.repository.name}</a>
            {" @ "}
            <a href={result.repository.commitUrl} target="_blank" rel="noreferrer" className="mono">{result.repository.commit.slice(0, 7)}</a>
            {" · "}
            {(result.scan.elapsedMs / 1000).toFixed(1)}s{strong.length > 0 && ` · ${openCount} open`}
          </p>

          <div className="notice">
            <strong>What this covers.</strong> {result.coverage.claim.replace(/^This lab searches/, "PoryGen currently searches")}{" "}
            {strong.length === 0
              ? "No strong match means nothing sufficiently specific was found in those sources — not that the code is original."
              : "A match is evidence to review, not proof of copying. Open the source, check its license, then dismiss it or fix the code and rescan."}
          </div>

          {result.scan.fetchedFiles === 0 && (
            <p className="notice notice-warn">
              <strong>Nothing to compare.</strong> This repository has no JavaScript, TypeScript or Python files PoryGen can check yet.
            </p>
          )}
          {incomplete.length > 0 && (
            <p className="notice notice-warn">
              <strong>Partial scan.</strong> Some supported files weren’t checked: {incomplete.join(", ")}.
            </p>
          )}
          {previous && sameCommit && <p className="notice">No new commits since the last scan, so results are unchanged.</p>}
          {resolved.length > 0 && (
            <p className="notice notice-ok">
              <strong>Resolved since the last scan:</strong> {resolved.map((f) => `${f.customer.path} ↔ ${f.publicSource?.repository}`).join(", ")}
            </p>
          )}

          {strong.length > 0 && (
            <ol className="ps-findings" aria-label="Strong matches">
              {strong.map((f) => (
                <FindingCard key={f.id} finding={f} decision={decisions[f.id]} onDecide={(d) => decide(f.id, d)} />
              ))}
            </ol>
          )}

          {possible.length > 0 && (
            <details className="ps-possible">
              <summary>
                {result.summary.possible} possible / common {result.summary.possible === 1 ? "pattern" : "patterns"} — similar shape to
                public code, usually fine{result.summary.possible > possible.length && ` (showing the ${possible.length} closest)`}
              </summary>
              <ol className="ps-findings" aria-label="Possible or common patterns">
                {possible.map((f) => (
                  <FindingCard key={f.id} finding={f} decision={decisions[f.id]} onDecide={(d) => decide(f.id, d)} />
                ))}
              </ol>
            </details>
          )}

          <div className="ps-footer-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(result.repository.url, true)}>
              {busy ? "Rescanning…" : "Rescan latest commit"}
            </button>
            <span className="hint">Fixed something? Push the change, then rescan to confirm it’s gone.</span>
          </div>
        </section>
      )}

      {!result && !busy && (
        <p className="hint ps-demo-link">
          Want a guided tour first? <Link to="/demo">See the sample walkthrough</Link> (fictional data).
        </p>
      )}
    </div>
  );
}
