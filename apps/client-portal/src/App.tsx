import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ClientLayout } from '@/components/layout/client-layout';
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
      <Routes>
        {/* Publiek */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/magic/:token" element={<MagicLinkPage />} />
        <Route path="/magic-link" element={<MagicLinkPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

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
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
