import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ClientFeatureGate } from '@/components/auth/feature-gate';
import { ClientLayout } from '@/components/layout/client-layout';
import { PublicKbLayout } from '@/components/layout/public-kb-layout';
import { Spinner } from '@/components/ui';

// Lazy-loaded pagina's (elke pagina is een `export default function`).
const LoginPage = lazy(() => import('@/pages/auth/login-page'));
const RegisterPage = lazy(() => import('@/pages/auth/register-page'));
const MagicLinkPage = lazy(() => import('@/pages/auth/magic-link-page'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password-page'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/reset-password-page'));
const DashboardPage = lazy(() => import('@/pages/dashboard/dashboard-page'));
const InspectionsPage = lazy(() => import('@/pages/inspections/inspections-page'));
const InspectionDetailPage = lazy(() => import('@/pages/inspections/inspection-detail-page'));
const DocumentViewerPage = lazy(() => import('@/pages/documents/document-viewer-page'));
const RequestsPage = lazy(() => import('@/pages/requests/requests-page'));
const NewRequestPage = lazy(() => import('@/pages/requests/new-request-page'));
const KennisbankPage = lazy(() => import('@/pages/kennisbank/kennisbank-page'));
const KennisbankArticlePage = lazy(
  () => import('@/pages/kennisbank/kennisbank-article-page'),
);
const HerstelLookupPage = lazy(() => import('@/pages/herstel/herstel-lookup-page'));
const HerstelOverzichtPage = lazy(() => import('@/pages/herstel/herstel-overzicht-page'));
const HerstelAfrondenPage = lazy(() => import('@/pages/herstel/herstel-afronden-page'));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ClientFeatureGate>
        <Routes>
          {/* Publiek */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/magic/:token" element={<MagicLinkPage />} />
          <Route path="/magic-link" element={<MagicLinkPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Publieke kennisbank (zonder login) — eigen zelfstandige layout */}
          <Route element={<PublicKbLayout />}>
            <Route
              path="/kennisbank-openbaar"
              element={<KennisbankPage publicMode />}
            />
            <Route
              path="/kennisbank-openbaar/:slug"
              element={<KennisbankArticlePage publicMode />}
            />
          </Route>

          {/* Publiek — online herstel (PRD-14): anonieme toegang met rapportnummer +
              postcode; overzicht/afronden draaien op het herstelsessie-token (geen login). */}
          <Route path="/herstel" element={<HerstelLookupPage />} />
          <Route path="/herstel/overzicht" element={<HerstelOverzichtPage />} />
          <Route path="/herstel/afronden" element={<HerstelAfrondenPage />} />

          {/* Root → dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Beveiligd (binnen de layout) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<ClientLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/inspections" element={<InspectionsPage />} />
              <Route path="/inspections/:id" element={<InspectionDetailPage />} />
              <Route path="/documents/:id" element={<DocumentViewerPage />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/requests/new" element={<NewRequestPage />} />
              <Route path="/kennisbank" element={<KennisbankPage />} />
              <Route path="/kennisbank/:slug" element={<KennisbankArticlePage />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ClientFeatureGate>
    </Suspense>
  );
}
