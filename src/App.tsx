import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthContext";
import { ProtectedLayout } from "./features/auth/ProtectedRoute";
import { MarketingLayout } from "./features/marketing/MarketingLayout";
import { LandingPage } from "./features/marketing/LandingPage";

const HowItWorksPage = lazy(() => import("./features/marketing/HowItWorksPage").then((m) => ({ default: m.HowItWorksPage })));
const PricingPage = lazy(() => import("./features/marketing/PricingPage").then((m) => ({ default: m.PricingPage })));
const SecurityPage = lazy(() => import("./features/marketing/SecurityPage").then((m) => ({ default: m.SecurityPage })));
const DocsPage = lazy(() => import("./features/marketing/DocsPage").then((m) => ({ default: m.DocsPage })));
const NotFoundPage = lazy(() => import("./features/marketing/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const DemoPage = lazy(() => import("./features/demo/DemoPage").then((m) => ({ default: m.DemoPage })));
const SignInPage = lazy(() => import("./features/auth/SignInPage").then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import("./features/auth/SignUpPage").then((m) => ({ default: m.SignUpPage })));

const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const FindingsPage = lazy(() => import("./features/findings/FindingsPage").then((m) => ({ default: m.FindingsPage })));
const FindingDetailPage = lazy(() => import("./features/findings/FindingDetailPage").then((m) => ({ default: m.FindingDetailPage })));
const RepositoriesPage = lazy(() => import("./features/repositories/RepositoriesPage").then((m) => ({ default: m.RepositoriesPage })));
const NewScanPage = lazy(() => import("./features/repositories/NewScanPage").then((m) => ({ default: m.NewScanPage })));
const ScanPage = lazy(() => import("./features/scanner/ScanPage").then((m) => ({ default: m.ScanPage })));
const PublicScanPage = lazy(() => import("./features/publicScan/PublicScanPage").then((m) => ({ default: m.PublicScanPage })));
const HistoryPage = lazy(() => import("./features/history/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const EvidenceBundlePage = lazy(() => import("./features/reports/EvidenceBundlePage").then((m) => ({ default: m.EvidenceBundlePage })));
const BillingStatusPage = lazy(() => import("./features/billing/BillingStatusPage").then((m) => ({ default: m.BillingStatusPage })));
const BillingDiagnosticsPage = lazy(() => import("./features/billing/BillingDiagnosticsPage").then((m) => ({ default: m.BillingDiagnosticsPage })));
const BillingSuccessPage = lazy(() => import("./features/billing/BillingSuccessPage").then((m) => ({ default: m.BillingSuccessPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function PageFallback() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="visually-hidden">Loading…</span>
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/how-it-works" element={<Lazy><HowItWorksPage /></Lazy>} />
            <Route path="/demo" element={<Lazy><DemoPage /></Lazy>} />
            <Route path="/scan" element={<Lazy><PublicScanPage /></Lazy>} />
            <Route path="/pricing" element={<Lazy><PricingPage /></Lazy>} />
            <Route path="/security" element={<Lazy><SecurityPage /></Lazy>} />
            <Route path="/docs" element={<Lazy><DocsPage /></Lazy>} />
            <Route path="/sign-in" element={<Lazy><SignInPage /></Lazy>} />
            <Route path="/sign-up" element={<Lazy><SignUpPage /></Lazy>} />
            <Route path="/product" element={<Navigate to="/how-it-works" replace />} />
            <Route path="/enterprise" element={<Navigate to="/pricing#enterprise" replace />} />
            <Route path="/lattice" element={<Navigate to="/demo" replace />} />
            <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
          </Route>

          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/findings" element={<FindingsPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
            <Route path="/repositories/new" element={<NewScanPage />} />
            <Route path="/scans/:scanId" element={<ScanPage />} />
            <Route path="/scans/:scanId/findings/:findingId" element={<FindingDetailPage />} />
            <Route path="/scans/:scanId/evidence" element={<EvidenceBundlePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/provenance" element={<Navigate to="/history?view=attribution" replace />} />
            <Route path="/billing" element={<BillingStatusPage />} />
            <Route path="/billing/diagnostics" element={<BillingDiagnosticsPage />} />
            <Route path="/billing/success" element={<BillingSuccessPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
