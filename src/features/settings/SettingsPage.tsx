import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../features/auth/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import type { ProfileRow } from "../../lib/dbTypes";

export function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as ProfileRow | null);
        setDisplayName((data as ProfileRow | null)?.display_name ?? "");
      });
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="pg-page-header">
        <div>
          <h1>Settings</h1>
          <p>Account details and profile.</p>
        </div>
      </div>

      <form className="pg-auth-form" onSubmit={onSubmit}>
        <div className="pg-field">
          <label className="pg-label" htmlFor="email">Email</label>
          <input id="email" className="pg-input" value={profile?.email ?? user?.email ?? ""} disabled />
        </div>
        <div className="pg-field">
          <label className="pg-label" htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            className="pg-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        {error && <div className="pg-form-error" role="alert">{error}</div>}
        {saved && <div style={{ color: "var(--pg-accent)", fontSize: "0.82rem" }}>Saved.</div>}
        <button type="submit" className="pg-btn pg-btn-primary" disabled={saving}>
          {saving ? "saving…" : "save changes"}
        </button>
      </form>

      <h2 className="pg-section-title">Account</h2>
      <div className="pg-kv-grid">
        <div className="pg-kv-cell">
          <div className="pg-kv-key">User ID</div>
          <div className="pg-kv-value">{user?.id}</div>
        </div>
        <div className="pg-kv-cell">
          <div className="pg-kv-key">Member since</div>
          <div className="pg-kv-value">{profile ? new Date(profile.created_at).toLocaleDateString() : "—"}</div>
        </div>
      </div>
    </div>
  );
}
