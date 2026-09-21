import { Link } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import "./marketing.css";

const PIPELINE = [
  { title: "Ingest", desc: "Repository manifest accepted over a host-allowlisted, size-limited fetch." },
  { title: "Index", desc: "Source files enumerated; binaries and vendor directories ignored." },
  { title: "Normalize AST", desc: "Syntax nodes normalized so renames and formatting don't hide structure." },
  { title: "Fingerprint", desc: "Winnowing selects fingerprints from normalized token k-grams." },
  { title: "License scan", desc: "Manifests and lockfiles checked against known SPDX identifiers." },
  { title: "Provenance", desc: "Editor and commit signals assembled into a composition summary." },
];

export function LandingPage() {
  return (
    <>
      <section className="pg-hero">
        <div className="pg-shell pg-hero-grid">
          <div>
            <h1>
              Own your code.
              <br />
              <span className="pg-accent-text">Prove your provenance.</span>
            </h1>
            <p className="pg-hero-sub">
              PoryGen records how software was created, identifies risky code ancestry, and turns
              AI-assisted development into an auditable evidence trail.
            </p>
            <div className="pg-hero-actions">
              <Link to="/sign-up" className="pg-btn pg-btn-primary">
                Feed a repository
              </Link>
              <Link to="/sign-in" className="pg-btn pg-btn-ghost">
                View sample audit
              </Link>
            </div>
          </div>

          <div className="pg-hero-stage">
            <div className="pg-hero-stage-critter">
              <BitCritter state="healthy" size={190} />
            </div>
            <div className="pg-hero-stage-caption">
              <div className="pg-hero-stage-status">chain intact · 847 events</div>
              <div className="pg-hero-stage-note">PoryGen Verified: Clear · scanned 4m ago</div>
            </div>
          </div>
        </div>
      </section>

      <section className="pg-section pg-section-tight">
        <div className="pg-shell">
          <div className="pg-terminal" aria-label="Sample scan telemetry">
            <span className="pg-terminal-line pg-terminal-dim">[ingest] repository manifest accepted</span>
            <span className="pg-terminal-line">
              <span className="pg-terminal-tag">[index]</span> 312 source files · 41,882 LOC
            </span>
            <span className="pg-terminal-line">
              <span className="pg-terminal-tag">[ast]</span> 17,482 syntax nodes normalized
            </span>
            <span className="pg-terminal-line">
              <span className="pg-terminal-tag">[winnow]</span> 3,842 fingerprints retained
            </span>
            <span className="pg-terminal-line">
              <span className="pg-terminal-tag">[corpus]</span> 43 reference candidates evaluated
            </span>
            <span className="pg-terminal-line pg-terminal-dim">
              [license] AGPL-3.0 candidate found in dependency graph
            </span>
            <span className="pg-terminal-line pg-terminal-dim">[policy] review required</span>
          </div>
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-shell">
          <div className="pg-section-head">
            <h2>Six stages, one evidence trail</h2>
            <p>
              Every scan runs the same deterministic pipeline, whether it's a public GitHub repository
              or the seeded Lattice demo project.
            </p>
          </div>
          <div className="pg-pipeline">
            {PIPELINE.map((step, i) => (
              <div className="pg-pipeline-step" key={step.title}>
                <div className="pg-pipeline-index">{String(i + 1).padStart(2, "0")}</div>
                <div className="pg-pipeline-title">{step.title}</div>
                <div className="pg-pipeline-desc">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-shell pg-two-col">
          <div>
            <span className="pg-kicker">Observed provenance composition</span>
            <h2>Mixed lineage, made visible</h2>
            <p style={{ marginTop: 12, color: "var(--pg-structure-dim)", fontSize: "0.92rem", lineHeight: 1.7 }}>
              PoryGen doesn't collapse a codebase into "human" or "AI." It tracks developer edits,
              assistant-authored insertions, human modification of AI output, and unresolved lineage —
              as evidence, not a legal determination of authorship.
            </p>
            <ul className="pg-check-list" style={{ marginTop: 24 }}>
              <li>Human-origin signals from continuous, human-cadence editing</li>
              <li>AI-origin signals from bulk, low-latency insertion bursts</li>
              <li>Human-modified-AI when a developer substantially reworks an AI insertion</li>
              <li>Unknown when no signal clears a confidence threshold</li>
            </ul>
          </div>
          <div className="pg-proof-strip">
            <div className="pg-proof-cell">
              <div className="pg-proof-value">61%</div>
              <div className="pg-proof-label">Human-origin signals</div>
            </div>
            <div className="pg-proof-cell">
              <div className="pg-proof-value">27%</div>
              <div className="pg-proof-label">AI-origin signals</div>
            </div>
            <div className="pg-proof-cell">
              <div className="pg-proof-value">8%</div>
              <div className="pg-proof-label">Human-modified AI</div>
            </div>
            <div className="pg-proof-cell">
              <div className="pg-proof-value">4%</div>
              <div className="pg-proof-label">Unknown</div>
            </div>
            <div className="pg-proof-cell">
              <div className="pg-proof-value">847</div>
              <div className="pg-proof-label">Chained provenance events</div>
            </div>
            <div className="pg-proof-cell">
              <div className="pg-proof-value">0</div>
              <div className="pg-proof-label">Blocking findings</div>
            </div>
          </div>
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-shell">
          <div className="pg-panel" style={{ padding: 40, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: "1.4rem" }}>Run a real scan in under two minutes</h2>
              <p style={{ marginTop: 8, color: "var(--pg-structure-dim)", fontSize: "0.9rem" }}>
                Feed a public GitHub repository, or open the seeded Lattice project for a deterministic walkthrough.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Link to="/sign-up" className="pg-btn pg-btn-primary">Feed a repository</Link>
              <Link to="/pricing" className="pg-btn pg-btn-ghost">See pricing</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
