import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { listRepositories, listProvenanceEvents } from "../../lib/api";
import type { ProvenanceEventRow, RepositoryRow } from "../../lib/dbTypes";
import { verifyChain, type ProvenanceEvent } from "@porygen/provenance-core";

const SOURCE_LABEL: Record<ProvenanceEventRow["source_type"], string> = {
  human: "human",
  ai: "ai",
  imported: "imported",
  generated: "generated",
  unknown: "unknown",
};

// <!-- OPUS_TASK: Deterministic provenance telemetry player
// Current behavior: the full seeded event list renders statically in the event-stream
// and chain columns, filterable by source type.
// Desired improvement: a playback controller (play/pause/reset/1x/2x) over the seeded
// timeline, synchronizing event-stream scroll position, attestation-panel highlighting,
// and the ledger's chain-status BitCritter to a simulated "current time" advancing
// through the real event_timestamp sequence.
// Implementation constraints: deterministic timeline data only (the real, already-
// ordered seeded events) — no random DOM mutation.
// Reduced-motion requirement: auto-play must respect prefers-reduced-motion (default to
// paused, manual step-through still available).
// Completion criteria: the page is fully functional today without this — it is additive
// playback polish over data that already renders correctly. -->
function toChainEvent(row: ProvenanceEventRow): ProvenanceEvent {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    ownerId: row.owner_id,
    filePath: row.file_path,
    sourceType: row.source_type,
    actorType: row.actor_type,
    provider: row.provider,
    tool: row.tool,
    commitSha: row.commit_sha,
    parentEventId: row.parent_event_id,
    contentHash: row.content_hash,
    diffHash: row.diff_hash,
    eventTimestamp: row.event_timestamp,
    metadata: row.metadata_json,
    previousEventHash: row.previous_event_hash,
    eventHash: row.event_hash,
    createdAt: row.created_at,
  };
}

export function ProvenanceLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState<RepositoryRow[]>([]);
  const [events, setEvents] = useState<ProvenanceEventRow[]>([]);
  const [chainIntact, setChainIntact] = useState<boolean | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | ProvenanceEventRow["source_type"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repositoryId = searchParams.get("repository");

  useEffect(() => {
    listRepositories().then((repos) => {
      setRepositories(repos);
      if (!repositoryId && repos[0]) {
        setSearchParams({ repository: repos[0].id }, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!repositoryId) return;
    setLoading(true);
    listProvenanceEvents(repositoryId)
      .then(async (rows) => {
        setEvents(rows);
        if (rows.length > 0) {
          const result = await verifyChain(rows.map(toChainEvent));
          setChainIntact(result.intact);
        } else {
          setChainIntact(null);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load provenance events."))
      .finally(() => setLoading(false));
  }, [repositoryId]);

  const filtered = useMemo(
    () => (sourceFilter === "all" ? events : events.filter((e) => e.source_type === sourceFilter)),
    [events, sourceFilter],
  );

  const composition = useMemo(() => {
    const counts: Record<string, number> = { human: 0, ai: 0, imported: 0, generated: 0, unknown: 0 };
    for (const e of events) counts[e.source_type]++;
    return counts;
  }, [events]);
  const total = events.length || 1;

  return (
    <div>
      <div className="pg-page-header">
        <div>
          <h1>Provenance ledger</h1>
          <p>Observed provenance composition — evidence of editing patterns, not a legal determination of authorship.</p>
        </div>
        <div className="pg-page-actions">
          <select
            className="pg-select"
            aria-label="Repository"
            value={repositoryId ?? ""}
            onChange={(e) => setSearchParams({ repository: e.target.value })}
          >
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="pg-form-error" style={{ marginBottom: 24 }}>{error}</div>}

      <div className="pg-stat-grid">
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{Math.round((composition.human / total) * 100)}%</div>
          <div className="pg-stat-label">Human-origin signals</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{Math.round((composition.ai / total) * 100)}%</div>
          <div className="pg-stat-label">AI-origin signals</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{Math.round((composition.imported / total) * 100)}%</div>
          <div className="pg-stat-label">Imported</div>
        </div>
        <div className="pg-stat-cell">
          <div className="pg-stat-value">{Math.round((composition.unknown / total) * 100)}%</div>
          <div className="pg-stat-label">Unknown</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--pg-structure-dim)", marginTop: 24 }}>loading ledger…</p>
      ) : events.length === 0 ? (
        <div className="pg-empty-state" style={{ marginTop: 24 }}>
          <BitCritter state="idle" size={56} />
          <p>No provenance events captured yet for this repository. Install the VS Code capture extension to start building a ledger — see packages/vscode-extension.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 1, background: "var(--pg-divider)", border: "1px solid var(--pg-divider)", marginTop: 24 }}>
          <div style={{ background: "var(--pg-base)", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Event stream</h2>
              <select
                className="pg-select"
                aria-label="Filter by source type"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
              >
                <option value="all">all sources</option>
                <option value="human">human</option>
                <option value="ai">ai</option>
                <option value="imported">imported</option>
                <option value="generated">generated</option>
                <option value="unknown">unknown</option>
              </select>
            </div>
            <div className="pg-terminal" style={{ maxHeight: 520, overflowY: "auto" }}>
              {filtered.map((e) => (
                <span className="pg-terminal-line" key={e.id}>
                  <span className="pg-terminal-dim">{new Date(e.event_timestamp).toLocaleTimeString()}</span>{" "}
                  <span className="pg-terminal-tag">[{SOURCE_LABEL[e.source_type]}]</span>{" "}
                  {e.file_path} {e.tool ? `· ${e.tool}` : ""} · {e.event_hash.slice(0, 10)}
                </span>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--pg-base)", padding: 20 }}>
            <h2 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
              Attestation / chain
            </h2>
            <div className="pg-panel" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <BitCritter state={chainIntact ? "healthy" : "integrity_warning"} size={40} />
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                  {chainIntact ? "chain intact" : "chain verification failed"}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--pg-structure-faint)" }}>{events.length} events</div>
              </div>
            </div>
            <div className="pg-terminal" style={{ maxHeight: 460, overflowY: "auto" }}>
              {filtered.map((e) => (
                <span className="pg-terminal-line" key={e.id}>
                  {e.event_hash.slice(0, 10)} ← {e.previous_event_hash ? e.previous_event_hash.slice(0, 10) : "genesis"}
                  {e.commit_sha ? ` · ${e.commit_sha.slice(0, 7)}` : ""}
                </span>
              ))}
            </div>
            <p style={{ marginTop: 16, fontSize: "0.72rem", color: "var(--pg-structure-faint)" }}>
              local hash-chain attestation · unsigned in-toto statement — see docs/PROVENANCE.md
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
