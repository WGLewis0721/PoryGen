import { Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { AppShell } from "../../components/AppShell";

/** Authenticated area: restores the session, redirects signed-out visitors, and renders the app shell. */
export function ProtectedLayout() {
  const { user, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-loading page-loading-full" role="status" aria-live="polite">
        <span>Restoring your session…</span>
      </div>
    );
  }

  if (configured && !user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }

  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="page-loading" role="status" aria-live="polite">
            <span className="visually-hidden">Loading…</span>
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
