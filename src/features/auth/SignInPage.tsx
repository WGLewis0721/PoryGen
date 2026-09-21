import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function SignInPage() {
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
    <div className="pg-shell pg-auth-wrap">
      <div className="pg-auth-card">
        <div className="pg-auth-head">
          <BitCritter state="idle" size={48} />
          <h1 style={{ fontSize: "1.2rem" }}>Sign in</h1>
        </div>

        {!configured && (
          <div className="pg-form-error" style={{ marginBottom: 16 }}>
            Supabase is not configured in this environment — authentication is unavailable until
            VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are set.
          </div>
        )}

        <form className="pg-auth-form" onSubmit={onSubmit}>
          <div className="pg-field">
            <label className="pg-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="pg-input"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="pg-field">
            <label className="pg-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="pg-input"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="pg-form-error" role="alert">{error}</div>}
          <button type="submit" className="pg-btn pg-btn-primary pg-btn-block" disabled={submitting || !configured}>
            {submitting ? "signing in…" : "sign in"}
          </button>
        </form>

        <p className="pg-auth-switch">
          No account yet? <Link to="/sign-up">Feed a repository</Link>
        </p>
      </div>
    </div>
  );
}
