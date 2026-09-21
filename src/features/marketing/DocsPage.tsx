import "./marketing.css";

const DOCS = [
  { file: "docs/ARCHITECTURE.md", title: "Architecture", desc: "Frontend, Supabase, GitHub ingestion, scanner, provenance, Stripe, and the future APEX entitlement boundary." },
  { file: "docs/DATA_MODEL.md", title: "Data model", desc: "Every table, column, constraint, and index behind profiles, repositories, scans, findings, and provenance events." },
  { file: "docs/SCANNER.md", title: "Scanner", desc: "Tree-sitter support, AST normalization, the Winnowing algorithm, the reference corpus, and known limitations." },
  { file: "docs/PROVENANCE.md", title: "Provenance", desc: "Event taxonomy, classifier heuristics, the hash chain, the in-toto format, and the Sigstore signing boundary." },
  { file: "docs/STRIPE_SETUP.md", title: "Stripe setup", desc: "Sandbox account, Product/Price, Checkout, webhook verification, and required metadata." },
  { file: "docs/APEX_DOGFOOD.md", title: "APEX dogfood", desc: "The exact unmapped-price experiment and the IDs an operator hands to APEX testing." },
  { file: "docs/SECURITY.md", title: "Security", desc: "RLS, SSRF protection, secret handling, and ownership checks across every surface." },
  { file: "docs/DEMO_FLOW.md", title: "Demo flow", desc: "The scripted walkthrough for Scenarios A through J." },
];

export function DocsPage() {
  return (
    <section className="pg-section">
      <div className="pg-shell">
        <div className="pg-section-head">
          <span className="pg-kicker">Documentation</span>
          <h2>Everything real, everything simulated, named explicitly</h2>
          <p>
            Full documents live in the repository under <code>docs/</code>. This page indexes what each
            one covers.
          </p>
        </div>

        <div className="pg-docs-grid">
          {DOCS.map((doc) => (
            <div className="pg-docs-card" key={doc.file}>
              <h3>{doc.title}</h3>
              <p>{doc.desc}</p>
              <p><code>{doc.file}</code></p>
            </div>
          ))}
        </div>

        <div id="claim-boundaries" className="pg-panel" style={{ padding: 32, marginTop: 48 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Claim boundaries</h2>
          <p style={{ marginTop: 12, color: "var(--pg-structure-dim)", fontSize: "0.88rem", lineHeight: 1.7 }}>
            PoryGen produces provenance evidence, not legal certification. An observed provenance
            composition is evidence about editing patterns, not a legal determination of copyright
            ownership. A structural-fingerprint match is evidence of code similarity against a
            configured reference corpus, not proof of infringement. A license-policy finding identifies
            a likely obligation for review; it is not legal advice. "PoryGen Verified: Clear" means no
            blocking findings were detected under the selected policy at the recorded scan time — it is
            explicitly snapshot-based, not a perpetual certification.
          </p>
        </div>
      </div>
    </section>
  );
}
