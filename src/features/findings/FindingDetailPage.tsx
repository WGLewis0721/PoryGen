import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { PolicyBadge } from "../../components/PolicyBadge";
import { getFinding } from "../../lib/api";
import type { ScanFindingRow } from "../../lib/dbTypes";

export function FindingDetailPage() {
  const { scanId, findingId } = useParams<{ scanId: string; findingId: string }>();
  const [finding, setFinding] = useState<ScanFindingRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId || !findingId) return;
    getFinding(scanId, findingId)
      .then(setFinding)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load finding."));
  }, [scanId, findingId]);

  if (error) return <div className="pg-form-error">{error}</div>;
  if (!finding) return <p style={{ color: "var(--pg-structure-dim)" }}>loading finding…</p>;

  const evidence = finding.evidence_json ?? {};

  return (
    <div style={{ maxWidth: 760 }}>
      <Link to={`/scans/${scanId}`} className="pg-nav-link" style={{ display: "inline-block", marginBottom: 20 }}>
        ← back to scan
      </Link>

      <div className="pg-page-header">
        <div>
          <h1>{finding.title}</h1>
          <p>{finding.type.replace("_", " ")} · detected {new Date(finding.created_at).toLocaleString()}</p>
        </div>
        <PolicyBadge status={finding.severity === "blocking" ? "BLOCKING" : finding.severity === "review" ? "REVIEW" : "CLEAR"} />
      </div>

      <div className="pg-panel" style={{ padding: 24, marginBottom: 24, display: "flex", gap: 20, alignItems: "center" }}>
        <BitCritter state={finding.severity === "blocking" ? "blocking" : finding.severity === "review" ? "review" : "healthy"} size={56} />
        <div>
          <div className="pg-kv-key">Why this was flagged</div>
          <p style={{ marginTop: 6, fontSize: "0.88rem", color: "var(--pg-structure-dim)", lineHeight: 1.6 }}>
            {finding.remediation ?? "No blocking policy condition applies — logged for the record."}
          </p>
        </div>
      </div>

      <h2 className="pg-section-title">Location</h2>
      <div className="pg-kv-grid" style={{ marginBottom: 32 }}>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">File</div>
          <div className="pg-kv-value">{finding.file_path ?? "—"}</div>
        </div>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">Lines</div>
          <div className="pg-kv-value">
            {finding.line_start ? `${finding.line_start}–${finding.line_end ?? finding.line_start}` : "—"}
          </div>
        </div>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">Confidence</div>
          <div className="pg-kv-value">{finding.confidence != null ? `${Math.round(finding.confidence * 100)}%` : "—"}</div>
        </div>
      </div>

      <h2 className="pg-section-title">Evidence</h2>
      <pre className="pg-terminal" style={{ whiteSpace: "pre-wrap" }}>
        {JSON.stringify(evidence, null, 2)}
      </pre>

      <p style={{ marginTop: 24, fontSize: "0.78rem", color: "var(--pg-structure-faint)", maxWidth: "65ch" }}>
        This is provenance evidence for engineering review, not legal advice or a determination of
        infringement. Route BLOCKING findings to counsel before distribution decisions.
      </p>
    </div>
  );
}
