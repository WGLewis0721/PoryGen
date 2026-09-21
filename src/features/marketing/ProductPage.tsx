import { Link } from "react-router-dom";
import { BitCritter, type BitCritterState } from "../../components/BitCritter";
import "./marketing.css";

const STATES: { state: BitCritterState; label: string; desc: string }[] = [
  { state: "idle", label: "Idle", desc: "No scan in progress; resting vital rhythm." },
  { state: "ingesting", label: "Ingesting", desc: "Repository manifest being fetched and indexed." },
  { state: "healthy", label: "Healthy", desc: "Scan complete, zero blocking findings." },
  { state: "review", label: "Review", desc: "Findings require engineering or counsel review." },
  { state: "blocking", label: "Blocking", desc: "A policy-blocking finding was detected." },
  { state: "integrity_warning", label: "Integrity warning", desc: "The provenance hash chain failed verification." },
];

export function ProductPage() {
  return (
    <>
      <section className="pg-section">
        <div className="pg-shell pg-section-head">
          <span className="pg-kicker">Product</span>
          <h2>A scanner, a ledger, and a familiar that reads the room</h2>
          <p>
            PoryGen combines structural fingerprinting, license inventory, and editor-level provenance
            capture into one policy verdict per scan — surfaced through the Bit-Critter's physiological
            state rather than a wall of dashboards.
          </p>
        </div>

        <div className="pg-two-col">
          <div>
            <h3 style={{ fontSize: "1.05rem", marginBottom: 16 }}>Free scanner (real, this build)</h3>
            <ul className="pg-check-list">
              <li>Tree-sitter-backed AST normalization for JavaScript, TypeScript, and Python</li>
              <li>Winnowing fingerprint selection (Schleimer/Wilkerson/Aiken) over normalized tokens</li>
              <li>Structural fingerprint match against a configured reference corpus — never the open internet</li>
              <li>License manifest and lockfile inventory across 8 file types, mapped to CLEAR / REVIEW / BLOCKING / UNKNOWN</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: "1.05rem", marginBottom: 16 }}>Pro daemon</h3>
            <ul className="pg-check-list">
              <li>Continuous provenance ledger with a tamper-evident hash chain</li>
              <li>VS Code capture extension classifying edit shape, not content</li>
              <li>Evidence export as JSON and a print-friendly audit report</li>
              <li>In-toto Statement attestations, with a Sigstore adapter ready for real signing credentials</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-shell">
          <div className="pg-section-head">
            <h2>Bit-Critter physiological states</h2>
            <p>Six states, driven entirely by scan and chain status — never a random idle animation.</p>
          </div>
          <div className="pg-docs-grid">
            {STATES.map((s) => (
              <div className="pg-docs-card" key={s.state} style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <BitCritter state={s.state} size={64} />
                <div>
                  <h3>{s.label}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pg-section">
        <div className="pg-shell" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link to="/sign-up" className="pg-btn pg-btn-primary">Feed a repository</Link>
          <Link to="/enterprise" className="pg-btn pg-btn-ghost">Enterprise architecture</Link>
        </div>
      </section>
    </>
  );
}
