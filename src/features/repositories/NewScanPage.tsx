import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanSearch } from "lucide-react";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { feedRepository } from "../../lib/api";

export function NewScanPage() {
  useDocumentTitle("Scan a repo — PoryGen");
  const navigate = useNavigate();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { scanId } = await feedRepository(repositoryUrl);
      navigate(`/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the scan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="narrow-page">
      <header className="page-head">
        <div>
          <h1>Scan a repo</h1>
          <p>
            Public GitHub repositories today. PoryGen reads up to 40 files as text — it never runs them — and compares their
            structure with its reference corpus.
          </p>
        </div>
      </header>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="repositoryUrl">
            GitHub repository
          </label>
          <input
            id="repositoryUrl"
            name="repository"
            inputMode="url"
            className="input mono"
            placeholder="https://github.com/owner/repo…"
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby="repositoryUrl-hint"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
          />
          <p id="repositoryUrl-hint" className="hint">
            Private repositories need the GitHub App, which is in development.
          </p>
        </div>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="cta-row">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <ScanSearch aria-hidden="true" />
            {submitting ? "Starting scan…" : "Run scan"}
          </button>
          <Link to="/demo" className="link-arrow">
            Not ready? Walk through the sample demo
          </Link>
        </div>
      </form>

      <p className="fine block">
        See <Link to="/security">security and data</Link> for exactly what is fetched and stored.
      </p>
    </div>
  );
}
