import "./marketing.css";

const CORE_NODES = [
  { id: "N1", title: "Source estate", desc: "Repositories, branches, and revision history under diligence scope." },
  { id: "N2", title: "Repository ingestion", desc: "Host-allowlisted fetch with size, file-count, and per-file byte limits." },
  { id: "N3", title: "AST normalization", desc: "Tree-sitter-based structural normalization, rename- and format-invariant." },
  { id: "N4", title: "Structural fingerprints", desc: "Winnowing selection over normalized token k-grams." },
  { id: "N5", title: "Dependency graph", desc: "Manifest and lockfile parsing across npm, PyPI, crates.io, and Go modules." },
  { id: "N6", title: "Provenance event graph", desc: "Editor and commit signals chained into a tamper-evident ledger." },
  { id: "N7", title: "SBOM enrichment", desc: "CycloneDX-compatible component inventory generated from resolved dependencies." },
  { id: "N8", title: "Policy evaluation", desc: "CLEAR / REVIEW / BLOCKING / UNKNOWN verdicts against a configured policy version." },
  { id: "N9", title: "Diligence evidence bundle", desc: "JSON export plus print-friendly report, structured for counsel or acquirer review." },
];

const FUTURE_NODES = [
  { id: "F1", title: "Large reference corpus", desc: "Corpus expansion beyond the bundled demo set — architecture, not implemented." },
  { id: "F2", title: "Semantic clone analysis", desc: "Embedding-based similarity beyond token-structural fingerprinting." },
  { id: "F3", title: "Headless UI capture", desc: "Rendered-DOM snapshotting for interface provenance." },
  { id: "F4", title: "Perceptual / DOM similarity review", desc: "Visual and structural UI comparison against reference products." },
  { id: "F5", title: "Private deployment", desc: "Single-tenant or on-prem boundary for regulated diligence engagements." },
];

export function EnterprisePage() {
  return (
    <section className="pg-section">
      <div className="pg-shell">
        <div className="pg-section-head">
          <span className="pg-kicker">Enterprise</span>
          <h2>Acquisition-diligence-grade engineering evidence</h2>
          <p>
            This is the target architecture, drawn to scale with what exists today. Nodes N1–N9 run in
            this build. Nodes F1–F5 are explicitly labeled roadmap — PoryGen does not pretend
            petabyte-scale infrastructure exists in the MVP.
          </p>
        </div>

        <div className="pg-schematic">
          {CORE_NODES.map((node) => (
            <div className="pg-schematic-node" key={node.id}>
              <div className="pg-schematic-node-id">{node.id}</div>
              <div className="pg-schematic-node-body">
                <div className="pg-schematic-node-title">{node.title}</div>
                <div className="pg-schematic-node-desc">{node.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="pg-section-head" style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: "1.15rem" }}>Optional future branches</h2>
        </div>
        <div className="pg-schematic">
          {FUTURE_NODES.map((node) => (
            <div className="pg-schematic-node pg-schematic-node-optional" key={node.id}>
              <div className="pg-schematic-node-id">{node.id}</div>
              <div className="pg-schematic-node-body">
                <div className="pg-schematic-node-title">{node.title} · Planned</div>
                <div className="pg-schematic-node-desc">{node.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
