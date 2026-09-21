import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AuthArt } from "./AuthArt";
import { useDocumentTitle } from "../../components/useDocumentTitle";

export function SignInPage() {
  useDocumentTitle("Sign in — PoryGen");
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    navigate(from, { replace: true });
  }

  return (
    <div className="auth">
      <AuthArt />
      <div className="auth-panel">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p>Pick up where your last scan left off.</p>

          {!configured && (
            <p className="notice notice-warn">
              Sign-in isn't available in this environment: Supabase isn't configured (VITE_SUPABASE_URL /
              VITE_SUPABASE_PUBLISHABLE_KEY). The <Link to="/demo">live demo</Link> works without an account.
            </p>
          )}

          <form className="auth-form" onSubmit={onSubmit}>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !configured}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            New to PoryGen? <Link to="/sign-up">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
