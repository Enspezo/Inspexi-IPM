import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from '@/components/error-boundary/error-boundary';
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
const UserDetailPage = lazy(() => import('@/pages/users/user-detail-page'));
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
const LocationsPage = lazy(
  () => import('@/pages/contacts/locations-page'),
);
const LocationDetailPage = lazy(
  () => import('@/pages/contacts/location-detail-page'),
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
const QuoteTemplateDetailPage = lazy(
  () => import('@/pages/quotes/quote-template-detail-page'),
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
const PlanningPage = lazy(() => import('@/pages/planning/planning-page'));
const PlanningDetailPage = lazy(() => import('@/pages/planning/planning-detail-page'));
const PlanningPublicPage = lazy(() => import('@/pages/planning/planning-public-page'));
const ProjectsPage = lazy(() => import('@/pages/projects/projects-page'));
const ProjectDetailPage = lazy(() => import('@/pages/projects/project-detail-page'));
const SearchPage = lazy(() => import('@/pages/search/search-page'));
const EmailTemplatesPage = lazy(() => import('@/pages/email-templates/email-templates-page'));
const EmailTemplateDetailPage = lazy(() => import('@/pages/email-templates/email-template-detail-page'));
const ErrorReportsPage = lazy(() => import('@/pages/error-reports/error-reports-page'));
const NotesPage = lazy(() => import('@/pages/notes/notes-page'));
const WorkOrdersPage = lazy(() => import('@/pages/work-orders/work-orders-page'));
const WorkOrderDetailPage = lazy(() => import('@/pages/work-orders/work-order-detail-page'));
// Inspectiedomein (Fase 5)
const InspectionsPage = lazy(() => import('@/pages/inspections/inspections-page'));
const InspectionDetailPage = lazy(() => import('@/pages/inspections/inspection-detail-page'));
const AssetsPage = lazy(() => import('@/pages/assets/assets-page'));
const AssetDetailPage = lazy(() => import('@/pages/assets/asset-detail-page'));
const ChecklistsPage = lazy(() => import('@/pages/checklists/checklists-page'));
const FindingTemplatesPage = lazy(() => import('@/pages/finding-templates/finding-templates-page'));
const ClassificationModelsPage = lazy(() => import('@/pages/classification-models/classification-models-page'));
const NormTypesPage = lazy(() => import('@/pages/norm-types/norm-types-page'));
const AssetTypesPage = lazy(() => import('@/pages/asset-types/asset-types-page'));
const LocationTypesPage = lazy(() => import('@/pages/location-types/location-types-page'));
const MeasurementSheetTemplatesPage = lazy(() => import('@/pages/measurement-sheet-templates/measurement-sheet-templates-page'));
const VoiceBasePromptsPage = lazy(() => import('@/pages/voice-prompts/voice-base-prompts-page'));
const VoiceTemplatePromptsPage = lazy(() => import('@/pages/voice-prompts/voice-template-prompts-page'));
const InspectionTemplatesPage = lazy(() => import('@/pages/inspection-templates/inspection-templates-page'));
const InspectionTemplateDetailPage = lazy(() => import('@/pages/inspection-templates/inspection-template-detail-page'));
const LookupsIndexPage = lazy(() => import('@/pages/lookups/lookups-index-page'));
const LookupManagePage = lazy(() => import('@/pages/lookups/lookup-manage-page'));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
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
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route
              path="/organization/settings"
              element={<OrganizationSettingsPage />}
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/persons" element={<ContactPersonsPage />} />
            <Route path="/contacts/persons/:personId" element={<ContactPersonDetailPage />} />
            <Route path="/contacts/locations" element={<LocationsPage />} />
            <Route path="/contacts/locations/:locationId" element={<LocationDetailPage />} />
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
            <Route path="/quote-templates/:id" element={<QuoteTemplateDetailPage />} />
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
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/planning/:id" element={<PlanningDetailPage />} />
            <Route path="/work-orders" element={<WorkOrdersPage />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/error-reports" element={<ErrorReportsPage />} />
            <Route path="/notities" element={<NotesPage />} />
            {/* Inspectiedomein (Fase 5) */}
            <Route path="/inspections" element={<InspectionsPage />} />
            <Route path="/inspections/:id" element={<InspectionDetailPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
            <Route path="/checklists" element={<ChecklistsPage />} />
            <Route path="/finding-templates" element={<FindingTemplatesPage />} />
            <Route path="/classification-models" element={<ClassificationModelsPage />} />
            <Route path="/norm-types" element={<NormTypesPage />} />
            <Route path="/asset-types" element={<AssetTypesPage />} />
            <Route path="/location-types" element={<LocationTypesPage />} />
            <Route path="/measurement-sheet-templates" element={<MeasurementSheetTemplatesPage />} />
            <Route path="/admin/voice-prompts" element={<VoiceBasePromptsPage />} />
            <Route path="/voice-prompts/template" element={<VoiceTemplatePromptsPage />} />
            <Route path="/inspection-templates" element={<InspectionTemplatesPage />} />
            <Route path="/inspection-templates/:id" element={<InspectionTemplateDetailPage />} />
            <Route path="/lookups" element={<LookupsIndexPage />} />
            <Route path="/lookups/:kind" element={<LookupManagePage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
