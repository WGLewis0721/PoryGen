import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="pg-footer">
      <div className="pg-shell pg-footer-inner">
        <div className="pg-footer-col">
          <div className="pg-footer-brand">PoryGen</div>
          <p className="pg-footer-tagline">The paper trail for AI-generated code.</p>
        </div>
        <div className="pg-footer-col">
          <span className="pg-label">Product</span>
          <Link to="/product">product</Link>
          <Link to="/pricing">pricing</Link>
          <Link to="/enterprise">enterprise</Link>
          <Link to="/lattice">sample audit</Link>
        </div>
        <div className="pg-footer-col">
          <span className="pg-label">Docs</span>
          <Link to="/docs">documentation</Link>
          <Link to="/docs/security">security</Link>
        </div>
        <div className="pg-footer-col">
          <span className="pg-label">Legal</span>
          <span className="pg-footer-note">
            Evidence, not certification — see <Link to="/docs#claim-boundaries">claim boundaries</Link>.
          </span>
        </div>
      </div>
      <div className="pg-shell">
        <p className="pg-footer-copyright">PoryGen — provenance evidence, not legal certification.</p>
      </div>
    </footer>
  );
}
