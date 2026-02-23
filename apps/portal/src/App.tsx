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
const ContactsPage = lazy(() => import('@/pages/contacts/contacts-page'));
const ContactDetailPage = lazy(
  () => import('@/pages/contacts/contact-detail-page'),
);
const RequestsPage = lazy(() => import('@/pages/requests/requests-page'));
const RequestDetailPage = lazy(
  () => import('@/pages/requests/request-detail-page'),
);
const ProductsPage = lazy(() => import('@/pages/products/products-page'));
const PriceTablesPage = lazy(
  () => import('@/pages/price-tables/price-tables-page'),
);
const PriceTableDetailPage = lazy(
  () => import('@/pages/price-tables/price-table-detail-page'),
);
const QuotesPage = lazy(() => import('@/pages/quotes/quotes-page'));
const QuoteDetailPage = lazy(
  () => import('@/pages/quotes/quote-detail-page'),
);
const QuoteEditorPage = lazy(
  () => import('@/pages/quotes/quote-editor-page'),
);
const QuoteTemplatesPage = lazy(
  () => import('@/pages/quotes/quote-templates-page'),
);

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
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/:id" element={<ContactDetailPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id/edit" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id" element={<QuoteDetailPage />} />
            <Route path="/quote-templates" element={<QuoteTemplatesPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/price-tables" element={<PriceTablesPage />} />
            <Route path="/price-tables/:id" element={<PriceTableDetailPage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
