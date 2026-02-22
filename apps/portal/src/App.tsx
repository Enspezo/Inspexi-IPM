import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Spinner } from '@/components/ui';

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/pages/auth/login-page'));
const AcceptInvitationPage = lazy(
  () => import('@/pages/auth/accept-invitation-page'),
);
const DashboardPage = lazy(() => import('@/pages/dashboard/dashboard-page'));
const UsersPage = lazy(() => import('@/pages/users/users-page'));
const OrganizationSettingsPage = lazy(
  () => import('@/pages/organization/organization-settings-page'),
);
const ProfilePage = lazy(() => import('@/pages/profile/profile-page'));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<AcceptInvitationPage />} />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Protected routes with layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route
              path="/organization/settings"
              element={<OrganizationSettingsPage />}
            />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
