import { Link } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";

export function NotFoundPage() {
  return (
    <div className="pg-shell pg-section" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <BitCritter state="integrity_warning" size={96} />
      <h1 style={{ fontSize: "1.4rem" }}>404 · no fingerprint match for this route</h1>
      <p style={{ color: "var(--pg-structure-dim)" }}>The path you followed doesn't resolve to a known PoryGen surface.</p>
      <Link to="/" className="pg-btn pg-btn-primary">Return to base</Link>
    </div>
  );
}
