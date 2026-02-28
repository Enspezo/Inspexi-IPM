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
const ForgotPasswordPage = lazy(
  () => import('@/pages/auth/forgot-password-page'),
);
const ResetPasswordPage = lazy(
  () => import('@/pages/auth/reset-password-page'),
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
const ContactPersonsPage = lazy(
  () => import('@/pages/contacts/contact-persons-page'),
);
const ContactPersonDetailPage = lazy(
  () => import('@/pages/contacts/contact-person-detail-page'),
);
const CustomerGroupsPage = lazy(
  () => import('@/pages/customer-groups/customer-groups-page'),
);
const CustomerGroupDetailPage = lazy(
  () => import('@/pages/customer-groups/customer-group-detail-page'),
);
const RequestsPage = lazy(() => import('@/pages/requests/requests-page'));
const RequestDetailPage = lazy(
  () => import('@/pages/requests/request-detail-page'),
);
const TasksPage = lazy(() => import('@/pages/tasks/tasks-page'));
const TaskDetailPage = lazy(
  () => import('@/pages/tasks/task-detail-page'),
);
const DocumentsPage = lazy(
  () => import('@/pages/documents/documents-page'),
);
const ProductsPage = lazy(() => import('@/pages/products/products-page'));
const ProductDetailPage = lazy(
  () => import('@/pages/products/product-detail-page'),
);
const ProductGroupsPage = lazy(
  () => import('@/pages/product-groups/product-groups-page'),
);
const ProductGroupDetailPage = lazy(
  () => import('@/pages/product-groups/product-group-detail-page'),
);
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
const PublicQuotePage = lazy(
  () => import('@/pages/quotes/public-quote-page'),
);
const NotificationsPage = lazy(
  () => import('@/pages/notifications/notifications-page'),
);
const OrganizationsPage = lazy(
  () => import('@/pages/organizations/organizations-page'),
);
const OrganizationDetailPage = lazy(
  () => import('@/pages/organizations/organization-detail-page'),
);
const ActivityPage = lazy(() => import('@/pages/activity/activity-page'));
const PlanningPage = lazy(() => import('@/pages/planning/planning-page'));
const PlanningDetailPage = lazy(() => import('@/pages/planning/planning-detail-page'));
const PlanningPublicPage = lazy(() => import('@/pages/planning/planning-public-page'));
const SearchPage = lazy(() => import('@/pages/search/search-page'));
const EmailTemplatesPage = lazy(() => import('@/pages/email-templates/email-templates-page'));
const EmailTemplateDetailPage = lazy(() => import('@/pages/email-templates/email-template-detail-page'));

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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/offerte/:token" element={<PublicQuotePage />} />
        <Route path="/afspraak/:token" element={<PlanningPublicPage />} />

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
            <Route path="/contacts/persons" element={<ContactPersonsPage />} />
            <Route path="/contacts/persons/:personId" element={<ContactPersonDetailPage />} />
            <Route path="/contacts/groups" element={<CustomerGroupsPage />} />
            <Route path="/contacts/groups/:id" element={<CustomerGroupDetailPage />} />
            <Route path="/contacts/:id" element={<ContactDetailPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/new" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id/edit" element={<QuoteEditorPage />} />
            <Route path="/quotes/:id" element={<QuoteDetailPage />} />
            <Route path="/quote-templates" element={<QuoteTemplatesPage />} />
            <Route path="/email-templates" element={<EmailTemplatesPage />} />
            <Route path="/email-templates/:id" element={<EmailTemplateDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/organizations" element={<OrganizationsPage />} />
            <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/groups" element={<ProductGroupsPage />} />
            <Route path="/products/groups/:id" element={<ProductGroupDetailPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/price-tables" element={<PriceTablesPage />} />
            <Route path="/price-tables/:id" element={<PriceTableDetailPage />} />
            <Route path="/activiteiten" element={<ActivityPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/planning/:id" element={<PlanningDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
