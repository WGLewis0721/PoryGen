import { useDocumentTitle } from "../../components/useDocumentTitle";
import "./marketing.css";

const DOCS = [
  { file: "README.md", title: "Overview", desc: "What PoryGen is, what's real, what's sample data, and how to run it." },
  { file: "docs/ARCHITECTURE.md", title: "Architecture", desc: "Browser, Supabase, the scan request → job → provider → findings → resolution path, and where it goes next." },
  { file: "docs/SCANNER.md", title: "Scanner", desc: "Normalization, Winnowing, similarity providers, bands and thresholds, coverage, and known limits." },
  { file: "docs/DATA_MODEL.md", title: "Data model", desc: "Tables, the resolution-history model, and the functions that change finding status." },
  { file: "docs/SECURITY.md", title: "Security", desc: "Row-level security, the ingestion boundary, secrets, webhooks, and data retention." },
  { file: "docs/PROVENANCE.md", title: "History and evidence", desc: "Resolution history, the evidence export, and optional editor attribution." },
  { file: "docs/DEMO_FLOW.md", title: "Demo flow", desc: "The public sample demo and the authenticated walkthrough, step by step." },
  { file: "docs/STRIPE_SETUP.md", title: "Stripe setup", desc: "Subscription prices, checkout, verified webhooks, and failing closed when unconfigured." },
  { file: "docs/APEX_DOGFOOD.md", title: "APEX dogfood", desc: "The separate operator test that uses PoryGen as an external Stripe customer." },
];

export function DocsPage() {
  useDocumentTitle("Documentation — PoryGen");
  return (
    <>
      <section className="page-hero">
        <div className="shell">
          <h1 className="display">Documentation.</h1>
          <p className="lede">The full documents live in the repository. This index says what each one covers.</p>
        </div>
      </section>
      <section className="section">
        <div className="shell doc-list">
          {DOCS.map((doc) => (
            <div className="doc-item" key={doc.file}>
              <h2>{doc.title}</h2>
              <p>{doc.desc}</p>
              <code>{doc.file}</code>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
