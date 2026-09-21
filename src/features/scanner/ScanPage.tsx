import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ToneTag } from "../../components/Tags";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { feedRepository, getRepository, getScan, listFindings } from "../../lib/api";
import type { RepositoryRow, ScanFindingRow, ScanRow } from "../../lib/dbTypes";
import { describeFinding, percent, TYPE_LABEL } from "../../lib/findingVocabulary";
import { formatDateTime, riskTone, RISK_LABEL } from "../../lib/format";

const STATUS_LABEL: Record<ScanRow["status"], string> = {
  queued: "Queued",
  ingesting: "Fetching the repository",
  indexing: "Reading files",
  normalizing_ast: "Normalizing structure",
  fingerprinting: "Fingerprinting and comparing",
  analyzing_licenses: "Checking licenses",
  building_provenance_summary: "Preparing results",
  complete: "Complete",
  failed: "Failed",
};

const ORDER: ScanRow["status"][] = [
  "queued",
  "ingesting",
  "indexing",
  "normalizing_ast",
  "fingerprinting",
  "analyzing_licenses",
  "building_provenance_summary",
  "complete",
];

const IN_PROGRESS = ORDER.slice(0, -1);

const LEGACY_CLAIM = "Structural fingerprint match against PoryGen's configured reference corpus — not a search of GitHub or the open internet.";

function FindingRow({ finding, scanId }: { finding: ScanFindingRow; scanId: string }) {
  const d = describeFinding(finding);
  const evidence = finding.evidence_json ?? {};
  const score = finding.type === "structural_similarity" ? percent((evidence.containment as number | undefined) ?? finding.confidence) : null;
  return (
    <li className="row">
      <ToneTag tone={d.tone}>{d.label}</ToneTag>
      <div className="row-main">
        <Link className="row-title" to={`/scans/${scanId}/findings/${finding.id}`}>
          {finding.type === "structural_similarity" ? finding.file_path : finding.title}
        </Link>
        <span className="row-meta">
          {TYPE_LABEL[finding.type]}
          {finding.type === "structural_similarity" ? ` · ${finding.title}` : finding.file_path ? ` · ${finding.file_path}` : ""}
        </span>
      </div>
      {score && (
        <div className="row-side">
          <span className="row-meta">{score} similar</span>
        </div>
      )}
    </li>
  );
}

/** Keyed by scan so moving to a rescan starts from a clean slate. */
export function ScanPage() {
  const { scanId } = useParams<{ scanId: string }>();
  return scanId ? <ScanView key={scanId} scanId={scanId} /> : null;
}

function ScanView({ scanId }: { scanId: string }) {
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [repository, setRepository] = useState<RepositoryRow | null>(null);
  const [findings, setFindings] = useState<ScanFindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  useDocumentTitle(`${repository?.name ?? "Scan"} — PoryGen`);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let repoLoaded = false;

    async function poll() {
      try {
        const next = await getScan(scanId);
        if (cancelled) return;
        if (!next) {
          setError("This scan doesn't exist, or you don't have access to it.");
          return;
        }
        setScan(next);
        if (!repoLoaded) {
          repoLoaded = true;
          getRepository(next.repository_id).then((r) => !cancelled && setRepository(r));
        }
        if (next.status === "complete") {
          const rows = await listFindings(scanId);
          if (!cancelled) setFindings(rows);
        } else if (IN_PROGRESS.includes(next.status)) {
          timer = setTimeout(poll, 900);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this scan.");
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scanId]);

  const grouped = useMemo(() => {
    const attention = findings.filter((f) => describeFinding(f).actionable);
    const info = findings.filter((f) => !describeFinding(f).actionable);
    const rank = (f: ScanFindingRow) => ({ strong: 0, review: 1 } as Record<string, number>)[describeFinding(f).tone] ?? 2;
    attention.sort((a, b) => rank(a) - rank(b));
    return { attention, info };
  }, [findings]);

  if (error) return <p className="notice notice-error">{error}</p>;
  if (!scan) {
    return (
      <div className="page-loading" role="status">
        Loading scan…
      </div>
    );
  }

  const inProgress = IN_PROGRESS.includes(scan.status);
  const stepIndex = Math.max(0, ORDER.indexOf(scan.status));
  const summary = scan.summary_json;
  const coverage = summary?.coverage ?? [];
  const canRescan = repository?.provider === "github" && !repository.is_demo;

  async function rescan() {
    if (!repository) return;
    setRescanning(true);
    try {
      const { scanId: next } = await feedRepository(repository.clone_url);
      navigate(`/scans/${next}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a rescan.");
    } finally {
      setRescanning(false);
    }
  }

  return (
    <div>
      <Link to="/repositories" className="back-link">
        <ArrowLeft aria-hidden="true" /> Repositories
      </Link>
      <header className="page-head">
        <div>
          <h1>{repository?.name ?? "Scan"}</h1>
          <p>
            {repository?.is_demo ? "Public sample repository · " : ""}
            Scan started {formatDateTime(scan.started_at)}
            {repository?.default_branch ? ` · ${repository.default_branch}` : ""}
          </p>
        </div>
        {scan.status === "complete" && (
          <div className="page-actions">
            {canRescan && (
              <button type="button" className="btn btn-secondary" onClick={rescan} disabled={rescanning}>
                <RefreshCw aria-hidden="true" /> {rescanning ? "Starting…" : "Rescan"}
              </button>
            )}
            <Link to={`/scans/${scan.id}/evidence`} className="btn btn-secondary">
              Export evidence
            </Link>
          </div>
        )}
      </header>

      <div className="scan-status">
        {scan.status === "complete" && scan.risk_level ? (
          <ToneTag tone={riskTone(scan.risk_level)}>{RISK_LABEL[scan.risk_level]}</ToneTag>
        ) : null}
        <span className="scan-status-text">{STATUS_LABEL[scan.status]}</span>
        {inProgress && (
          <div className="progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${(stepIndex + 1) / ORDER.length})` }} />
          </div>
        )}
        <span className="visually-hidden" role="status" aria-live="polite">
          Scan status: {STATUS_LABEL[scan.status]}
        </span>
      </div>

      {scan.status === "failed" && (
        <p className="notice notice-error block-notice">
          The scan failed{scan.error_code ? ` (${scan.error_code})` : ""}. The log below has the detail.
        </p>
      )}

      {scan.status === "complete" && (
        <>
          {summary?.similarity ? (
            <ul className="today block" aria-label="Files by result">
              <li className="today-item">
                <div className="today-cell">
                  <ToneTag tone="clear">Clear</ToneTag>
                  <span className="today-value">{summary.similarity.clear}</span>
                </div>
              </li>
              <li className="today-item">
                <div className="today-cell">
                  <ToneTag tone="common">Common pattern</ToneTag>
                  <span className="today-value">{summary.similarity.commonPattern}</span>
                </div>
              </li>
              <li className="today-item">
                <div className="today-cell">
                  <ToneTag tone="review">Review suggested</ToneTag>
                  <span className="today-value">{summary.similarity.reviewSuggested}</span>
                </div>
              </li>
              <li className="today-item">
                <div className="today-cell">
                  <ToneTag tone="strong">Strong source match</ToneTag>
                  <span className="today-value">{summary.similarity.strongMatch}</span>
                </div>
              </li>
            </ul>
          ) : (
            <div className="kv block">
              <div className="kv-cell">
                <div className="kv-key">Files checked</div>
                <div className="kv-value">{scan.files_scanned}</div>
              </div>
              <div className="kv-cell">
                <div className="kv-key">Dependencies checked</div>
                <div className="kv-value">{scan.dependencies_scanned}</div>
              </div>
              <div className="kv-cell">
                <div className="kv-key">Needs attention</div>
                <div className="kv-value">{grouped.attention.length}</div>
              </div>
            </div>
          )}

          <section className="block" aria-labelledby="scan-attention">
            <div className="block-head">
              <h2 id="scan-attention" className="block-title">
                Needs attention ({grouped.attention.length})
              </h2>
            </div>
            {grouped.attention.length === 0 ? (
              <p className="muted">Nothing here needs a person. Every checked file came back clear or informational.</p>
            ) : (
              <ul className="rows">
                {grouped.attention.map((f) => (
                  <FindingRow key={f.id} finding={f} scanId={scan.id} />
                ))}
              </ul>
            )}
          </section>

          {grouped.info.length > 0 && (
            <section className="block" aria-labelledby="scan-info">
              <details className="log-details">
                <summary id="scan-info">Informational ({grouped.info.length}) — clear licenses and common patterns</summary>
                <ul className="rows">
                  {grouped.info.map((f) => (
                    <FindingRow key={f.id} finding={f} scanId={scan.id} />
                  ))}
                </ul>
              </details>
            </section>
          )}

          <section className="block" aria-labelledby="scan-coverage">
            <h2 id="scan-coverage" className="block-title">
              What this scan compared against
            </h2>
            <div className="coverage-box block-gap">
              {coverage.length > 0 ? (
                coverage.map((c) => (
                  <p key={c.providerId}>
                    <strong>{c.providerName}.</strong> {c.claim}
                  </p>
                ))
              ) : (
                <p>{LEGACY_CLAIM}</p>
              )}
              {summary?.findingsTruncated && <p>Some informational rows were omitted to keep this scan readable.</p>}
            </div>
          </section>
        </>
      )}

      <section className="block">
        <details className="log-details" open={inProgress || scan.status === "failed"}>
          <summary>Scan log</summary>
          <pre className="log" aria-live={inProgress ? "polite" : undefined}>
            {(summary?.terminalLog ?? []).join("\n") || "Waiting for the first step…"}
          </pre>
        </details>
      </section>
    </div>
  );
}
