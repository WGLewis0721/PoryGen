import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BitCritter } from "../../components/BitCritter";
import { useAuth } from "./AuthContext";
import "./auth.css";

export function SignUpPage() {
  const { signUp, configured } = useAuth();
  const navigate = useNavigate();
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

  if (submitted) {
    return (
      <div className="pg-shell pg-auth-wrap">
        <div className="pg-auth-card" style={{ textAlign: "center" }}>
          <BitCritter state="ingesting" size={56} />
          <h1 style={{ fontSize: "1.15rem", marginTop: 16 }}>Check your inbox</h1>
          <p style={{ marginTop: 10, color: "var(--pg-structure-dim)", fontSize: "0.88rem" }}>
            We sent a confirmation link to {email}. Once confirmed, sign in to feed your first repository.
          </p>
          <Link to="/sign-in" className="pg-btn pg-btn-primary" style={{ marginTop: 20, display: "inline-flex" }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pg-shell pg-auth-wrap">
      <div className="pg-auth-card">
        <div className="pg-auth-head">
          <BitCritter state="idle" size={48} />
          <h1 style={{ fontSize: "1.2rem" }}>Create your account</h1>
        </div>

        {!configured && (
          <div className="pg-form-error" style={{ marginBottom: 16 }}>
            Supabase is not configured in this environment — account creation is unavailable until
            VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are set.
          </div>
        )}

        <form className="pg-auth-form" onSubmit={onSubmit}>
          <div className="pg-field">
            <label className="pg-label" htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              className="pg-input"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="pg-form-error" role="alert">{error}</div>}
          <button type="submit" className="pg-btn pg-btn-primary pg-btn-block" disabled={submitting || !configured}>
            {submitting ? "creating account…" : "create account"}
          </button>
        </form>

        <p className="pg-auth-switch">
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
