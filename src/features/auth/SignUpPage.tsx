import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AuthArt } from "./AuthArt";
import { useDocumentTitle } from "../../components/useDocumentTitle";

export function SignUpPage() {
  useDocumentTitle("Create an account — PoryGen");
  const { signUp, configured } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password, displayName || email.split("@")[0]);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="auth">
      <AuthArt />
      <div className="auth-panel">
        <div className="auth-card">
          {submitted ? (
            <>
              <h1>Check your inbox.</h1>
              <p>
                PoryGen sent a confirmation link to <strong>{email}</strong>. Confirm it, sign in, and scan your first repository.
              </p>
              <p className="cta-row">
                <Link to="/sign-in" className="btn btn-primary">
                  Go to sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1>Scan your first repo.</h1>
              <p>Free for one public repository. No credit card.</p>

              {!configured && (
                <p className="notice notice-warn">
                  Accounts aren't available in this environment: Supabase isn't configured. The <Link to="/demo">live demo</Link>{" "}
                  works without one.
                </p>
              )}

              <form className="auth-form" onSubmit={onSubmit}>
                <div className="field">
                  <label className="label" htmlFor="displayName">
                    Name <span className="hint">(optional)</span>
                  </label>
                  <input id="displayName" name="name" type="text" className="input" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <input id="email" name="email" type="email" className="input" required autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    className="input"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p id="password-hint" className="hint">
                    At least 8 characters.
                  </p>
                </div>
                {error && (
                  <p className="notice notice-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !configured}>
                  {submitting ? "Creating account…" : "Create account"}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account? <Link to="/sign-in">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
