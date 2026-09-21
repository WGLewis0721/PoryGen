import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";

import { MarketingLayout } from "./features/marketing/MarketingLayout";
import { LandingPage } from "./features/marketing/LandingPage";
import { ProductPage } from "./features/marketing/ProductPage";
import { PricingPage } from "./features/marketing/PricingPage";
import { EnterprisePage } from "./features/marketing/EnterprisePage";
import { DocsPage } from "./features/marketing/DocsPage";
import { NotFoundPage } from "./features/marketing/NotFoundPage";

import { SignInPage } from "./features/auth/SignInPage";
import { SignUpPage } from "./features/auth/SignUpPage";

import { DashboardPage } from "./features/dashboard/DashboardPage";
import { RepositoriesPage } from "./features/repositories/RepositoriesPage";
import { NewScanPage } from "./features/repositories/NewScanPage";
import { ScanPage } from "./features/scanner/ScanPage";
import { FindingDetailPage } from "./features/findings/FindingDetailPage";
import { ProvenanceLedgerPage } from "./features/provenance/ProvenanceLedgerPage";
import { EvidenceBundlePage } from "./features/reports/EvidenceBundlePage";
import { BillingStatusPage } from "./features/billing/BillingStatusPage";
import { BillingDiagnosticsPage } from "./features/billing/BillingDiagnosticsPage";
import { BillingSuccessPage } from "./features/billing/BillingSuccessPage";
import { SettingsPage } from "./features/settings/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/product" element={<ProductPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/enterprise" element={<EnterprisePage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/lattice" element={<Navigate to="/repositories" replace />} />
          </Route>

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories"
            element={
              <ProtectedRoute>
                <RepositoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/repositories/new"
            element={
              <ProtectedRoute>
                <NewScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scans/:scanId"
            element={
              <ProtectedRoute>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scans/:scanId/findings/:findingId"
            element={
              <ProtectedRoute>
                <FindingDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/provenance"
            element={
              <ProtectedRoute>
                <ProvenanceLedgerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scans/:scanId/evidence"
            element={
              <ProtectedRoute>
                <EvidenceBundlePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <BillingStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing/diagnostics"
            element={
              <ProtectedRoute>
                <BillingDiagnosticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing/success"
            element={
              <ProtectedRoute>
                <BillingSuccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
