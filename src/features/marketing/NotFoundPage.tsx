import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import "./marketing.css";

export function NotFoundPage() {
  useDocumentTitle("Page not found — PoryGen");
  return (
    <section className="shell not-found" aria-labelledby="nf-title">
      <h1 id="nf-title" className="display">
        Nothing matches this page.
      </h1>
      <p className="lede">The link may be old, or the page may have moved.</p>
      <p className="cta-row">
        <Link to="/" className="btn btn-primary">
          Go home
        </Link>
        <Link to="/demo" className="link-arrow">
          Or see the live demo
        </Link>
      </p>
    </section>
  );
}
