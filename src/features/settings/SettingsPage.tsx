import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useDocumentTitle } from "../../components/useDocumentTitle";
import { supabase } from "../../lib/supabaseClient";
import type { ProfileRow } from "../../lib/dbTypes";
import { formatDateTime } from "../../lib/format";

export function SettingsPage() {
  useDocumentTitle("Settings — PoryGen");
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
    const { error } = await supabase.from("profiles").update({ display_name: displayName, updated_at: new Date().toISOString() }).eq("id", user.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="narrow-page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account and profile.</p>
        </div>
      </header>

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" value={profile?.email ?? user?.email ?? ""} disabled />
        </div>
        <div className="field">
          <label className="label" htmlFor="displayName">
            Display name
          </label>
          <input id="displayName" name="name" autoComplete="name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="notice notice-ok" role="status">
            Saved.
          </p>
        )}
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <section className="block" aria-labelledby="settings-account">
        <h2 id="settings-account" className="block-title">
          Account
        </h2>
        <div className="kv block-gap">
          <div className="kv-cell">
            <div className="kv-key">User ID</div>
            <div className="kv-value mono">{user?.id ?? "—"}</div>
          </div>
          <div className="kv-cell">
            <div className="kv-key">Member since</div>
            <div className="kv-value">{profile ? formatDateTime(profile.created_at) : "—"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
