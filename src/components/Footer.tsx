import { Link } from "react-router-dom";
import { PRODUCT_LINE } from "../config/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-grid">
        <div className="site-footer-brand">
          <Link to="/" className="wordmark" aria-label="PoryGen home">
            PoryGen
          </Link>
          <p className="site-footer-line">{PRODUCT_LINE}</p>
        </div>
        <nav className="site-footer-col" aria-label="Product">
          <span className="label-caps">Product</span>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/demo">Live demo</Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <nav className="site-footer-col" aria-label="Trust">
          <span className="label-caps">Trust</span>
          <Link to="/security">Security and data</Link>
          <Link to="/security#claims">What PoryGen doesn’t claim</Link>
          <Link to="/docs">Documentation</Link>
          <Link to="/terms">Terms of Use</Link>
        </nav>
        <nav className="site-footer-col" aria-label="Account">
          <span className="label-caps">Account</span>
          <Link to="/sign-in">Sign in</Link>
          <Link to="/sign-up">Create an account</Link>
        </nav>
      </div>
      <div className="shell site-footer-base">
        <p>
          Similarity findings are evidence for review, not proof of copying and not legal advice. Coverage is limited to
          the reference sources PoryGen compares against — see <Link to="/security#claims">what PoryGen doesn’t claim</Link>.
        </p>
        <p>© 2026 PoryGen · Landscape imagery generated for PoryGen.</p>
      </div>
    </footer>
  );
}
