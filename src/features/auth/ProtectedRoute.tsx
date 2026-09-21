import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AppShell } from "../../components/AppShell";
import { BitCritter } from "../../components/BitCritter";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="pg-full-loading" role="status" aria-live="polite">
        <BitCritter state="ingesting" size={56} label="Loading session" />
        <p>restoring session…</p>
      </div>
    );
  }

  if (configured && !user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <AppShell>{children}</AppShell>;
}
