import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, ScanSearch } from "lucide-react";
import { CodeCompare } from "../../components/CodeCompare";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { getTermsAcceptance } from "../legal/termsAcceptance";
import type { Finding, Range, ScanResult } from "./types";
import {
  ScanInputError,
  buildGitHubScanRequest,
  buildZipScanRequest,
  exclusionLines,
  findingContext,
  findingNextAction,
  formatScanFailure,
  isPrivateUpload,
  normalizeExclusions,
  pathExcluded,
  persistPublicScan,
  prepareFilesSource,
  projectRelativePath,
  resolvedSince,
  scanHeadline,
  scanInputFailure,
  selectionRoot,
  shouldPersistScan,
  uploadHasNoEligibleFiles,
  whyItMatched,
  type ScanRequestBody,
} from "./scanRequest";
import { downloadSourceMatchReport, type ReportContext, type ScanDecision, type FolderSelection } from "./sourceMatchReport";
import "./public-scan.css";

type Decision = ScanDecision;
type Decisions = Record<string, Decision>;
type SourceMode = "github" | "zip" | "files";
type FolderNote = FolderSelection;

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

const VISIBLE_PATHS = 200;

/** People paste "owner/repo" and "github.com/owner/repo" as often as a full URL. */
export function normalizeRepositoryInput(value: string) {
  const text = value.trim().replace(/\/+$/, "");
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^github\.com\//i.test(text)) return `https://${text}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) return `https://github.com/${text}`;
  return text;
}

const storageKey = (repo: string) => `porygen.scan.${repo.toLowerCase()}`;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function persist(result: ScanResult, decisions: Decisions) {
  persistPublicScan(result, decisions, { local: localStorage, session: sessionStorage });
}

const lineLabel = (range: Range | null) => (!range ? "" : range.start === range.end ? `line ${range.start}` : `lines ${range.start}–${range.end}`);

const sourceHref = (finding: Finding) => {
  const source = finding.publicSource!;
  if (!source.lines || !source.url) return source.url;
  try {
    const host = new URL(source.url).hostname.toLowerCase();
    return host === "github.com" ? `${source.url}#L${source.lines.start}-L${source.lines.end}` : source.url;
  } catch {
    return source.url;
  }
};

function FindingCard({ finding, decision, onDecide }: { finding: Finding; decision?: Decision; onDecide: (d: Decision | null) => void }) {
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const strong = finding.classification === "strong_match";
  const source = finding.publicSource!;
  const dismissed = decision?.status === "dismissed";
  const href = sourceHref(finding);

  return (
    <li className={`ps-finding${strong ? " is-strong" : ""}${dismissed ? " is-dismissed" : ""}`}>
      <div className="ps-finding-head">
        <span className={`tag ${strong ? "tag-strong" : "tag-common"}`}>{strong ? "Strong match" : "Possible / common pattern"}</span>
        {decision && <span className="tag tag-neutral">{dismissed ? `Dismissed: ${decision.reason}` : "In review"}</span>}
      </div>
      <h3 className="ps-finding-title">
        Affected file <span className="mono">{finding.customer.path}</span> {lineLabel(finding.customer.lines)}
      </h3>
      <dl className="ps-read">
        <div>
          <dt>Possible source</dt>
          <dd>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="mono">{source.repository}/{source.path}</a>
            ) : (
              <span className="mono">{source.repository}/{source.path}</span>
            )}
            {source.lines ? ` ${lineLabel(source.lines)}` : ""}
          </dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>
            {source.license
              ? source.licenseUrl
                ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>
                : source.license
              : "No license was recorded for this source."}
          </dd>
        </div>
        <div>
          <dt>Why it matched</dt>
          <dd>{whyItMatched(finding)}</dd>
        </div>
        <div>
          <dt>Context</dt>
          <dd>{findingContext()}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{findingNextAction(finding)}</dd>
        </div>
      </dl>

      {!dismissed && finding.customer.lines && source.lines && finding.customer.excerpt && source.excerpt && (
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
        {href && (
          <a
            className="btn btn-secondary btn-sm"
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={() => !decision && onDecide({ status: "reviewing", at: new Date().toISOString() })}
          >
            Open the source <ExternalLink aria-hidden="true" />
          </a>
        )}
        {dismissed ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDecide(null)}>Reopen</button>
        ) : (
          <span className="ps-dismiss">
            <label className="visually-hidden" htmlFor={`reason-${finding.id}`}>Dismiss reason</label>
            <select id={`reason-${finding.id}`} className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
              {DISMISS_REASONS.map((item) => <option key={item}>{item}</option>)}
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

function bindFolderInput(node: HTMLInputElement | null) {
  // MDN: webkitdirectory is the implemented directory-picker attribute.
  node?.setAttribute("webkitdirectory", "");
  node?.toggleAttribute("multiple", true);
}

export function PublicScanPage() {
  useDocumentTitle("Scan for a source match");
  const [params, setParams] = useSearchParams();
  const repoParam = params.get("repo") ?? "";
  const [mode, setMode] = useState<SourceMode>("github");
  const [input, setInput] = useState(repoParam);
  const [exclusions, setExclusions] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [folderSummary, setFolderSummary] = useState<FolderNote | null>(null);
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [previous, setPrevious] = useState<ScanResult | null>(null);
  const [rescanned, setRescanned] = useState(false);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastRun = useRef("");
  const current = useRef<ScanResult | null>(null);

  const execute = useCallback(async (body: ScanRequestBody, isRescan: boolean, reportInput?: { label: string; folder?: FolderSelection }) => {
    setBusy(true);
    setError("");
    if (!isRescan) setResult(null);
    try {
      const acceptance = getTermsAcceptance();
      if (!acceptance) throw new ScanInputError("TERMS_REQUIRED", "Accept the current Terms of Use before scanning.");
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({ error: "The scanner is unavailable right now. Try again shortly." }));
      if (!response.ok) throw new Error(formatScanFailure(data));
      const next = data as ScanResult;
      setReportContext({ completedAt: new Date().toISOString(), label: reportInput?.label ?? next.repository.name, folder: reportInput?.folder });
      const requestedUpload = body.sourceType === "zip" || body.sourceType === "files";
      if (requestedUpload || isPrivateUpload(next)) {
        setPrevious(null);
        setRescanned(false);
        setDecisions({});
        setResult(next);
        current.current = next;
      } else {
        const stored = load<{ scan: ScanResult; decisions: Decisions }>(storageKey(next.repository.name));
        const kept = stored?.decisions ?? {};
        setPrevious(isRescan ? current.current : stored?.scan ?? null);
        setRescanned(isRescan);
        setDecisions(kept);
        setResult(next);
        current.current = next;
        if (shouldPersistScan(next)) persist(next, kept);
      }
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (caught) {
      if (caught instanceof ScanInputError) setError(scanInputFailure(caught));
      else setError(caught instanceof Error ? caught.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const runGitHub = useCallback(async (url: string, isRescan: boolean, exclusionText: string) => {
    const acceptance = getTermsAcceptance();
    if (!acceptance) {
      setError(scanInputFailure(new ScanInputError("TERMS_REQUIRED", "Accept the current Terms of Use before scanning.")));
      return;
    }
    try {
      const request = buildGitHubScanRequest(url, exclusionLines(exclusionText), acceptance);
      await execute(request, isRescan);
    } catch (caught) {
      if (caught instanceof ScanInputError) setError(scanInputFailure(caught));
      else setError(caught instanceof Error ? caught.message : "Scan failed.");
    }
  }, [execute]);

  useEffect(() => {
    const url = normalizeRepositoryInput(repoParam);
    if (url && lastRun.current !== url) {
      lastRun.current = url;
      setInput(url);
      setMode("github");
      void runGitHub(url, false, exclusions);
    }
  }, [repoParam, runGitHub, exclusions]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const acceptance = getTermsAcceptance();
    if (!acceptance) {
      setError(scanInputFailure(new ScanInputError("TERMS_REQUIRED", "Accept the current Terms of Use before scanning.")));
      return;
    }
    try {
      if (mode === "github") {
        const url = normalizeRepositoryInput(input);
        if (!url) return;
        if (url !== input) setInput(url);
        if (url === normalizeRepositoryInput(repoParam)) void runGitHub(url, false, exclusions);
        else setParams({ repo: url });
        return;
      }
      if (mode === "zip") {
        if (!zipFile) throw new ScanInputError("INVALID_ARCHIVE", "The upload is not a supported ZIP archive.");
        const request = buildZipScanRequest(new Uint8Array(await zipFile.arrayBuffer()), exclusionLines(exclusions), acceptance);
        await execute(request, false, { label: zipFile.name });
        return;
      }
      if (folderFiles.length === 0) throw new Error("Choose a project folder to scan.");
      const prepared = await prepareFilesSource(
        folderFiles.map((file) => ({
          path: projectRelativePath(file),
          size: file.size,
          read: async () => new Uint8Array(await file.arrayBuffer()),
        })),
        exclusionLines(exclusions),
        acceptance,
      );
      const folderNote: FolderSelection = {
        sent: prepared.request.files.length,
        excluded: prepared.excluded,
        omittedDependencies: prepared.omittedDependencies,
        omittedBinary: prepared.omittedBinary,
        omittedTooLarge: prepared.omittedTooLarge,
        trimmed: prepared.trimmed,
      };
      setFolderSummary(folderNote);
      await execute(prepared.request, false, { label: selectionRoot(folderFiles.map(projectRelativePath)) || "Selected local files", folder: folderNote });
    } catch (caught) {
      if (caught instanceof ScanInputError) setError(scanInputFailure(caught));
      else setError(caught instanceof Error ? caught.message : "Scan failed.");
    }
  }

  function decide(id: string, decision: Decision | null) {
    if (!result) return;
    const next = { ...decisions };
    if (decision) next[id] = decision;
    else delete next[id];
    setDecisions(next);
    if (shouldPersistScan(result)) persist(result, next);
  }

  function addExclusion(path: string) {
    const rules = exclusionLines(exclusions);
    if (rules.some((rule) => rule.normalize("NFC") === path.normalize("NFC"))) return;
    setExclusions(rules.concat(path).join("\n"));
  }

  const matches = result?.findings.filter((finding) => finding.classification !== "insufficient_evidence" && finding.publicSource !== null) ?? [];
  const strong = matches.filter((finding) => finding.classification === "strong_match");
  const possible = matches.filter((finding) => finding.classification !== "strong_match");
  const openCount = strong.filter((finding) => decisions[finding.id]?.status !== "dismissed").length;
  const resolved = resolvedSince(previous, result);
  const sameCommit = Boolean(previous && result && !isPrivateUpload(result) && previous.repository.commit === result.repository.commit);
  const emptyUpload = result ? uploadHasNoEligibleFiles(result) : false;
  const incomplete = result
    ? Object.entries(result.scan.incompleteReasons ?? {})
      .filter(([reason]) => reason !== "user_excluded")
      .map(([reason, count]) => `${count} ${count === 1 ? "file" : "files"} ${REASON_LABELS[reason] ?? reason.replaceAll("_", " ")}`)
    : [];
  const folderPaths = folderFiles.map((file) => projectRelativePath(file)).filter(Boolean).sort();
  const folderRoot = selectionRoot(folderPaths);
  let exclusionRules: string[] = [];
  try {
    exclusionRules = normalizeExclusions(exclusionLines(exclusions));
  } catch {
    exclusionRules = [];
  }
  const visibleFolderPaths = folderPaths.filter((path) => !pathExcluded(path, exclusionRules)).slice(0, VISIBLE_PATHS);

  return (
    <div className="ps shell">
      <header className="ps-intro">
        <h1 className="display ps-title">Scan for a source match</h1>
        <p className="lede">
          Does this code meaningfully resemble code that exists somewhere else, and where might it have come from?
          Compare a public GitHub repository, a .zip project, or a folder on your computer with indexed public sources.
        </p>
      </header>

      <form className="ps-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="ps-modes">
          <legend className="label">What should PoryGen scan?</legend>
          <label className="ps-mode">
            <input type="radio" name="scan-source" value="github" checked={mode === "github"} onChange={() => setMode("github")} />
            Public GitHub URL
          </label>
          <label className="ps-mode">
            <input type="radio" name="scan-source" value="zip" checked={mode === "zip"} onChange={() => setMode("zip")} />
            .zip project
          </label>
          <label className="ps-mode">
            <input type="radio" name="scan-source" value="files" checked={mode === "files"} onChange={() => setMode("files")} />
            Local folder
          </label>
        </fieldset>

        {mode === "github" && (
          <div className="field">
            <label className="label" htmlFor="repo-url">Public repository URL</label>
            <input
              id="repo-url"
              className="input mono"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://github.com/owner/repo"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
        )}

        {mode === "zip" && (
          <div className="field">
            <label className="label" htmlFor="zip-file">Project .zip</label>
            <input
              id="zip-file"
              className="input ps-file"
              type="file"
              accept=".zip,application/zip"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setZipFile(event.target.files?.[0] ?? null)}
            />
            <p className="hint" id="zip-hint">
              ZIP paths keep the top-level folder. If the archive starts with <span className="mono">my-app/</span>, exclude <span className="mono">my-app/src/starter</span>, not <span className="mono">src/starter</span>. The archive is scanned in memory and is not stored.
            </p>
          </div>
        )}

        {mode === "files" && (
          <div className="field">
            <label className="label" htmlFor="project-folder">Project folder</label>
            <input
              id="project-folder"
              className="input ps-file"
              type="file"
              multiple
              ref={(node) => {
                bindFolderInput(node);
              }}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setFolderFiles(Array.from(event.target.files ?? []));
                setFolderSummary(null);
              }}
            />
            <p className="hint" id="folder-hint">
              {folderRoot
                ? <>Paths start with <span className="mono">{folderRoot}/</span>. Exclusions have to use that prefix. Dependency, build, and binary files are left out of the upload.</>
                : "Choose a project folder. Paths include the folder name. Dependency, build, and binary files are left out of the upload."}
              {folderFiles.length > 0 && ` ${folderFiles.length} selected.`}
            </p>
            {folderPaths.length > 0 && (
              <details className="ps-paths">
                <summary>Selected paths</summary>
                <ul>
                  {visibleFolderPaths.map((path) => (
                    <li key={path}>
                      <span className="mono">{path}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => addExclusion(path)}>Exclude</button>
                    </li>
                  ))}
                </ul>
                {folderPaths.length > VISIBLE_PATHS && <p className="hint">Showing the first {VISIBLE_PATHS} paths. Type any other exact path below.</p>}
              </details>
            )}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="exclusions">Exclude starter, template, or boilerplate paths</label>
          <textarea
            id="exclusions"
            className="textarea mono"
            value={exclusions}
            onChange={(event) => setExclusions(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={"src/starter\ntemplates/boilerplate"}
            aria-describedby="exclusions-hint"
          />
          <p className="hint" id="exclusions-hint">
            Exact relative file or folder paths, one per line. A folder excludes only what is inside it. <span className="mono">src/template</span> does not exclude <span className="mono">src/template-old</span>. No globs. Excluded files are omitted from the report, not marked resolved.
          </p>
        </div>

        <div className="ps-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <ScanSearch aria-hidden="true" /> {busy ? "Scanning…" : "Scan"}
          </button>
        </div>
        <p className="hint">
          No account needed. A public GitHub result may be saved in this browser so you can rescan it. Uploaded archives, folders, source, and their results are not saved in this browser or on PoryGen’s servers.
          {mode === "github" && (
            <>
              {" "}Try{" "}
              {EXAMPLES.map((example, index) => (
                <span key={example}>
                  {index > 0 && " or "}
                  <button type="button" className="ps-linkbtn mono" onClick={() => setInput(example)}>
                    {example.replace("https://github.com/", "")}
                  </button>
                </span>
              ))}
              .
            </>
          )}
        </p>
      </form>

      <div role="status" aria-live="polite">
        {busy && <p className="notice">Checking the code against indexed public sources. This usually takes a few seconds; larger projects can take longer…</p>}
      </div>
      {error && !busy && (
        <p className="notice notice-error" role="alert">
          <strong>Scan didn’t run.</strong> {error}
        </p>
      )}

      {folderSummary && mode === "files" && (
        <p className="notice">
          <strong>Folder selection.</strong> {folderSummary.sent} source {folderSummary.sent === 1 ? "file" : "files"} sent
          {folderSummary.excluded > 0 && `, ${folderSummary.excluded} excluded by the paths above`}
          {folderSummary.omittedDependencies > 0 && `, ${folderSummary.omittedDependencies} dependency or build ${folderSummary.omittedDependencies === 1 ? "file" : "files"} left out`}
          {folderSummary.omittedBinary > 0 && `, ${folderSummary.omittedBinary} binary`}
          {folderSummary.omittedTooLarge > 0 && `, ${folderSummary.omittedTooLarge} over 100 KB`}
          {folderSummary.trimmed > 0 && `, ${folderSummary.trimmed} not sent because the request reached its size limit`}
          .
        </p>
      )}

      {result && (
        <section className="ps-result" aria-labelledby="ps-result-title">
          <h2 id="ps-result-title" ref={headingRef} tabIndex={-1} className="display ps-heading">
            {scanHeadline(result, strong.length, openCount)}
          </h2>
          <p className="ps-meta">
            {result.repository.url ? (
              <a href={result.repository.url} target="_blank" rel="noreferrer" className="mono">{result.repository.name}</a>
            ) : (
              <span className="mono">{result.repository.name}</span>
            )}
            {result.repository.commitUrl && result.repository.commit ? (
              <>
                {" @ "}
                <a href={result.repository.commitUrl} target="_blank" rel="noreferrer" className="mono">{result.repository.commit.slice(0, 7)}</a>
              </>
            ) : result.repository.commit ? (
              <>
                {" · "}
                <span className="mono">{result.repository.commit.slice(0, 12)}</span>
                {" content digest, not a Git commit"}
              </>
            ) : null}
            {" · "}
            {(result.scan.elapsedMs / 1000).toFixed(1)}s{strong.length > 0 && ` · ${openCount} open`}
          </p>

          {reportContext && (
            <div className="ps-footer-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => downloadSourceMatchReport(result, decisions, reportContext)}>
                Download Source Match Report
              </button>
              <span className="hint">Offline HTML with current review decisions and code excerpts. Open it to print or save as PDF. Downloading saves a copy on your device; share it deliberately.</span>
            </div>
          )}

          {emptyUpload ? (
            <div className="notice notice-warn">
              <strong>No eligible source files were scanned.</strong> This does not mean the project is clear.
            </div>
          ) : (
            <div className="notice">
              <strong>What this covers.</strong> {result.coverage.claim.replace(/^This lab searches/, "PoryGen currently searches")}{" "}
              {strong.length === 0
                ? result.scan.partial
                  ? "For this partial scan, no strong match means nothing sufficiently specific was found in the files actually checked — not that the unchecked files or repository are clear."
                  : "No strong match means nothing sufficiently specific was found in those sources — not that the code is original."
                : "A match is evidence to review, not proof of copying. Open the source, check its license, then dismiss it or change the code and scan again."}
            </div>
          )}

          {(result.scan.exclusions?.length ?? 0) > 0 && (
            <div className="notice">
              <strong>Exclusions.</strong> These exact paths were left out before matching. Leaving a file out does not resolve an earlier finding.
              <ul className="ps-exclusion-list">
                {result.scan.exclusions?.map((rule) => <li key={rule} className="mono">{rule}</li>)}
              </ul>
              {typeof result.scan.excludedFiles === "number" && (
                <p>{result.scan.excludedFiles} submitted {result.scan.excludedFiles === 1 ? "entry matches" : "entries match"} those rules.</p>
              )}
            </div>
          )}

          {!isPrivateUpload(result) && result.scan.treeComplete === false && (
            <p className="notice notice-warn">
              <strong>Only part of this repository was checked.</strong> It is too large for GitHub to list in one
              request, so PoryGen only ever saw{" "}
              {(result.scan.skippedCount + result.scan.fetchedFiles).toLocaleString("en-US")} of its files, and found{" "}
              {result.scan.supportedFilesInTree.length} it can check among them. Treat “no match” here as “not
              checked”, not as clean.
            </p>
          )}
          {isPrivateUpload(result) && !emptyUpload && (
            <p className="notice">
              Only the uploaded files were checked. A file that does not appear here was not proved deleted from the rest of the project.
            </p>
          )}
          {result.scan.partial && !emptyUpload && (
            <p className="notice notice-warn">
              <strong>Partial scan.</strong>{" "}
              {result.scan.incompleteSupportedFiles > 0
                ? `${result.scan.incompleteSupportedFiles.toLocaleString("en-US")} supported ${result.scan.incompleteSupportedFiles === 1 ? "file was" : "files were"} not checked`
                : "Not every supported file was checked"}
              {incomplete.length > 0 && ` (${incomplete.join(", ")})`}.
              {strong.length === 0 && " No strong source match means only that none was found in the files checked."}
            </p>
          )}
          {rescanned && sameCommit && <p className="notice">No new commits since the last scan, so results are unchanged.</p>}
          {resolved.length > 0 && (
            <p className="notice notice-ok">
              <strong>Resolved since the last scan:</strong> {resolved.map((finding) => `${finding.customer.path} ↔ ${finding.publicSource?.repository}`).join(", ")}
            </p>
          )}

          {strong.length > 0 && (
            <ol className="ps-findings" aria-label="Strong matches">
              {strong.map((finding) => (
                <FindingCard key={finding.id} finding={finding} decision={decisions[finding.id]} onDecide={(decision) => decide(finding.id, decision)} />
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
                {possible.map((finding) => (
                  <FindingCard key={finding.id} finding={finding} decision={decisions[finding.id]} onDecide={(decision) => decide(finding.id, decision)} />
                ))}
              </ol>
            </details>
          )}

          {result.repository.url && (
            <div className="ps-footer-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void runGitHub(result.repository.url ?? "", true, exclusions)}>
                {busy ? "Rescanning…" : "Rescan latest commit"}
              </button>
              <span className="hint">Fixed something? Push the change, then rescan to confirm it’s gone.</span>
            </div>
          )}
          {isPrivateUpload(result) && (
            <p className="hint">Uploaded projects are not stored. Choose the archive or folder again to scan a newer copy.</p>
          )}
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
