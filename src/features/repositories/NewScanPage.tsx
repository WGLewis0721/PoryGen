import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { feedRepository, listScansForRepository } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import type { RepositoryRow } from "../../lib/dbTypes";

export function NewScanPage() {
  const navigate = useNavigate();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lattice, setLattice] = useState<RepositoryRow | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("repositories")
      .select("*")
      .eq("is_demo", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setLattice(data as RepositoryRow | null));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { scanId } = await feedRepository(repositoryUrl);
      navigate(`/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start scan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openLattice() {
    if (!lattice) return;
    const scans = await listScansForRepository(lattice.id);
    if (scans[0]) navigate(`/scans/${scans[0].id}`);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pg-page-header">
        <div>
          <h1>Feed a repository</h1>
          <p>Public GitHub repositories only. PoryGen fetches through a host-allowlisted, size-limited ingestion boundary — see docs/SECURITY.md.</p>
        </div>
      </div>

      <form className="pg-auth-form" onSubmit={onSubmit} style={{ marginBottom: 32 }}>
        <div className="pg-field">
          <label className="pg-label" htmlFor="repositoryUrl">Repository URL</label>
          <input
            id="repositoryUrl"
            className="pg-input"
            placeholder="https://github.com/owner/repo"
            required
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
          />
        </div>
        {error && <div className="pg-form-error" role="alert">{error}</div>}
        <button type="submit" className="pg-btn pg-btn-primary" disabled={submitting}>
          {submitting ? "starting scan…" : "run scan"}
        </button>
      </form>

      <div className="pg-panel" style={{ padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
        <BitCritter state="healthy" size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>Lattice — seeded demo project</div>
          <p style={{ marginTop: 4, fontSize: "0.82rem", color: "var(--pg-structure-dim)" }}>
            A deterministic scan with four representative findings and a full provenance ledger. No GitHub fetch required.
          </p>
        </div>
        <button type="button" className="pg-btn pg-btn-ghost" onClick={openLattice} disabled={!lattice}>
          {lattice ? "open Lattice" : "not seeded"}
        </button>
      </div>
    </div>
  );
}
