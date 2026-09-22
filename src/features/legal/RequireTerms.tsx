import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { hasAcceptedCurrentTerms } from "./termsAcceptance";

export function RequireTerms({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!hasAcceptedCurrentTerms()) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/terms?return=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <>{children}</>;
}
