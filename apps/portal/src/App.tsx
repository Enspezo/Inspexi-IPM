import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from '@/components/error-boundary/error-boundary';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { FeatureRoute } from '@/components/auth/feature-route';
import { RoleRoute } from '@/components/auth/role-route';
import { AppLayout } from '@/components/layout/app-layout';
import { Spinner } from '@/components/ui';
import { ADMIN_ROLES, CRM_ROLES } from '@/lib/roles';
import { Role } from '@/types';

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
const PublicSignPage = lazy(
  () => import('@/pages/inspections/public-sign-page'),
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
const PlansPage = lazy(() => import('@/pages/plans/plans-page'));
const PlanDetailPage = lazy(() => import('@/pages/plans/plan-detail-page'));
const PlanningPage = lazy(() => import('@/pages/planning/planning-page'));
const PlanningDetailPage = lazy(() => import('@/pages/planning/planning-detail-page'));
const PlanningPublicPage = lazy(() => import('@/pages/planning/planning-public-page'));
const ProjectsPage = lazy(() => import('@/pages/projects/projects-page'));
const ProjectDetailPage = lazy(() => import('@/pages/projects/project-detail-page'));
const SearchPage = lazy(() => import('@/pages/search/search-page'));
const EmailTemplatesPage = lazy(() => import('@/pages/email-templates/email-templates-page'));
const EmailTemplateDetailPage = lazy(() => import('@/pages/email-templates/email-template-detail-page'));
const ErrorReportsPage = lazy(() => import('@/pages/error-reports/error-reports-page'));
const HelpCenterPage = lazy(() => import('@/pages/help/help-center-page'));
const HelpArticlePage = lazy(() => import('@/pages/help/help-article-page'));
const HelpAdminPage = lazy(() => import('@/pages/help/help-admin-page'));
const TicketsPage = lazy(() => import('@/pages/help/tickets/tickets-page'));
const NewTicketPage = lazy(() => import('@/pages/help/tickets/new-ticket-page'));
const TicketDetailPage = lazy(() => import('@/pages/help/tickets/ticket-detail-page'));
const NotesPage = lazy(() => import('@/pages/notes/notes-page'));
const FavoritesPage = lazy(() => import('@/pages/favorites/favorites-page'));
const WorkOrdersPage = lazy(() => import('@/pages/work-orders/work-orders-page'));
const WorkOrderDetailPage = lazy(() => import('@/pages/work-orders/work-order-detail-page'));
// Inspectiedomein (Fase 5)
const InspectionsPage = lazy(() => import('@/pages/inspections/inspections-page'));
const InspectionDetailPage = lazy(() => import('@/pages/inspections/inspection-detail-page'));
const AssetsPage = lazy(() => import('@/pages/assets/assets-page'));
const AssetDetailPage = lazy(() => import('@/pages/assets/asset-detail-page'));
const InspectorsPage = lazy(() => import('@/pages/inspectors/inspectors-page'));
const InspectorDetailPage = lazy(() => import('@/pages/inspectors/inspector-detail-page'));
const AvailabilityTemplatesPage = lazy(() => import('@/pages/organization/availability-templates-page'));
const MyAvailabilityPage = lazy(() => import('@/pages/availability/my-availability-page'));
const ChecklistsPage = lazy(() => import('@/pages/checklists/checklists-page'));
const ChecklistDetailPage = lazy(() => import('@/pages/checklists/checklist-detail-page'));
const ChecklistItemsPage = lazy(() => import('@/pages/checklist-items/checklist-items-page'));
const FindingTemplatesPage = lazy(() => import('@/pages/finding-templates/finding-templates-page'));
const FindingTemplateDetailPage = lazy(() => import('@/pages/finding-templates/finding-template-detail-page'));
const ClassificationModelsPage = lazy(() => import('@/pages/classification-models/classification-models-page'));
const ClassificationModelDetailPage = lazy(() => import('@/pages/classification-models/classification-model-detail-page'));
const NormTypesPage = lazy(() => import('@/pages/norm-types/norm-types-page'));
const NormTypeDetailPage = lazy(() => import('@/pages/norm-types/norm-type-detail-page'));
const AssetTypesPage = lazy(() => import('@/pages/asset-types/asset-types-page'));
const AssetTypeDetailPage = lazy(() => import('@/pages/asset-types/asset-type-detail-page'));
const MeetmiddelenPage = lazy(() => import('@/pages/meetmiddelen/meetmiddelen-page'));
const MeetmiddelDetailPage = lazy(() => import('@/pages/meetmiddelen/meetmiddel-detail-page'));
const LocationTypesPage = lazy(() => import('@/pages/location-types/location-types-page'));
const LocationTypeDetailPage = lazy(() => import('@/pages/location-types/location-type-detail-page'));
const MeasurementSheetTemplatesPage = lazy(() => import('@/pages/measurement-sheet-templates/measurement-sheet-templates-page'));
const MeasurementSheetTemplateDetailPage = lazy(() => import('@/pages/measurement-sheet-templates/measurement-sheet-template-detail-page'));
const VoiceBasePromptsPage = lazy(() => import('@/pages/voice-prompts/voice-base-prompts-page'));
const VoiceTemplatePromptsPage = lazy(() => import('@/pages/voice-prompts/voice-template-prompts-page'));
const InspectionTemplatesPage = lazy(() => import('@/pages/inspection-templates/inspection-templates-page'));
const InspectionTemplateDetailPage = lazy(() => import('@/pages/inspection-templates/inspection-template-detail-page'));
const LookupsIndexPage = lazy(() => import('@/pages/lookups/lookups-index-page'));
const LookupManagePage = lazy(() => import('@/pages/lookups/lookup-manage-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

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
        <Route path="/sign/:requestId" element={<PublicSignPage />} />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Protected routes with layout. Gegate routes zijn per feature gegroepeerd
            onder een <FeatureRoute>; core/platform-routes blijven ongated (de
            FeatureGuard op de API blijft de echte grens — dit is UX). */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Core / platform — niet feature-gated (auth, dashboard, profiel,
                zoeken, help). Beheer- en platformroutes zijn wél rol-gated via
                <RoleRoute> (WP-C1 / B-509) — de RolesGuard op de API blijft de
                echte grens, dit is UX voor deeplinks/bladwijzers. */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/availability-templates" element={<AvailabilityTemplatesPage />} />
            <Route path="/my-availability" element={<MyAvailabilityPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/help" element={<HelpCenterPage />} />
            <Route path="/help/category/:slug" element={<HelpCenterPage />} />
            <Route path="/help/article/:slug" element={<HelpArticlePage />} />
            <Route path="/help/admin" element={<HelpAdminPage />} />
            {/* /new vóór /:id zodat "new" niet als ticket-id matcht */}
            <Route path="/help/tickets" element={<TicketsPage />} />
            <Route path="/help/tickets/new" element={<NewTicketPage />} />
            <Route path="/help/tickets/:id" element={<TicketDetailPage />} />

            {/* ORG_ADMIN-only beheerroutes (B-509) */}
            <Route element={<RoleRoute roles={ADMIN_ROLES} />}>
              <Route path="/users" element={<UsersPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
              <Route
                path="/organization/settings"
                element={<OrganizationSettingsPage />}
              />
              <Route path="/email-templates" element={<EmailTemplatesPage />} />
              <Route path="/email-templates/:id" element={<EmailTemplateDetailPage />} />
            </Route>

            {/* SUPERUSER-only platform- en Inspectie-systeemroutes (B-509).
                NB: de API laat GET /classification-models en /norm-types bewust
                toe voor ORG_ADMIN (config-dropdowns); alleen de beheerpagina's
                zijn SUPERUSER-only. */}
            <Route element={<RoleRoute roles={[Role.SUPERUSER]} />}>
              <Route path="/organizations" element={<OrganizationsPage />} />
              <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/plans/:id" element={<PlanDetailPage />} />
              <Route path="/error-reports" element={<ErrorReportsPage />} />
              <Route path="/classification-models" element={<ClassificationModelsPage />} />
              <Route path="/classification-models/:id" element={<ClassificationModelDetailPage />} />
              <Route path="/norm-types" element={<NormTypesPage />} />
              <Route path="/norm-types/:id" element={<NormTypeDetailPage />} />
              <Route path="/admin/voice-prompts" element={<VoiceBasePromptsPage />} />
            </Route>

            {/* BASIS_CRM — relaties, contactpersonen, locaties.
                B-315 §7: rol-gate (CRM_ROLES) — een INSPECTEUR kreeg hier een
                lege lijst te zien terwijl de API 403 gaf. */}
            <Route element={<FeatureRoute feature="BASIS_CRM" />}>
              <Route element={<RoleRoute roles={CRM_ROLES} />}>
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/contacts/persons" element={<ContactPersonsPage />} />
                <Route path="/contacts/persons/:personId" element={<ContactPersonDetailPage />} />
                <Route path="/contacts/locations" element={<LocationsPage />} />
                <Route path="/contacts/locations/:locationId" element={<LocationDetailPage />} />
                <Route path="/contacts/:id" element={<ContactDetailPage />} />
              </Route>
            </Route>

            {/* CRM_COMPLEET — klantgroepen, aanvragen, offertes, producten, prijstabellen */}
            <Route element={<FeatureRoute feature="CRM_COMPLEET" />}>
              <Route path="/contacts/groups" element={<CustomerGroupsPage />} />
              <Route path="/contacts/groups/:id" element={<CustomerGroupDetailPage />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/requests/:id" element={<RequestDetailPage />} />
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/quotes/new" element={<QuoteEditorPage />} />
              <Route path="/quotes/:id/edit" element={<QuoteEditorPage />} />
              <Route path="/quotes/:id" element={<QuoteDetailPage />} />
              <Route path="/quote-templates" element={<QuoteTemplatesPage />} />
              <Route path="/quote-templates/:id" element={<QuoteTemplateDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/groups" element={<ProductGroupsPage />} />
              <Route path="/products/groups/:id" element={<ProductGroupDetailPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/price-tables" element={<PriceTablesPage />} />
              <Route path="/price-tables/:id" element={<PriceTableDetailPage />} />
            </Route>

            {/* BASIS_UITVOERING — projecten */}
            <Route element={<FeatureRoute feature="BASIS_UITVOERING" />}>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
            </Route>

            {/* UITVOERING_COMPLEET — planning, werkbonnen */}
            <Route element={<FeatureRoute feature="UITVOERING_COMPLEET" />}>
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/planning/:id" element={<PlanningDetailPage />} />
              <Route path="/work-orders" element={<WorkOrdersPage />} />
              <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
            </Route>

            {/* BASIS_INSPECTIES — inspectie-uitvoering, assets + de inspectie-config */}
            <Route element={<FeatureRoute feature="BASIS_INSPECTIES" />}>
              <Route path="/inspections" element={<InspectionsPage />} />
              <Route path="/inspections/:id" element={<InspectionDetailPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/assets/:id" element={<AssetDetailPage />} />
              <Route path="/inspectors" element={<InspectorsPage />} />
              <Route path="/inspectors/:userId" element={<InspectorDetailPage />} />
              <Route path="/meetmiddelen" element={<MeetmiddelenPage />} />
              <Route path="/meetmiddelen/:id" element={<MeetmiddelDetailPage />} />
              <Route path="/checklists" element={<ChecklistsPage />} />
              <Route path="/checklists/:id" element={<ChecklistDetailPage />} />
              <Route path="/checklist-items" element={<ChecklistItemsPage />} />
              <Route path="/finding-templates" element={<FindingTemplatesPage />} />
              <Route path="/finding-templates/:id" element={<FindingTemplateDetailPage />} />
              <Route path="/asset-types" element={<AssetTypesPage />} />
              <Route path="/asset-types/:id" element={<AssetTypeDetailPage />} />
              <Route path="/location-types" element={<LocationTypesPage />} />
              <Route path="/location-types/:id" element={<LocationTypeDetailPage />} />
              {/* Meetstaat-templates horen bij het SUPERUSER-only Inspectie-systeem (B-509) */}
              <Route element={<RoleRoute roles={[Role.SUPERUSER]} />}>
                <Route path="/measurement-sheet-templates" element={<MeasurementSheetTemplatesPage />} />
                <Route path="/measurement-sheet-templates/:id" element={<MeasurementSheetTemplateDetailPage />} />
              </Route>
              <Route path="/voice-prompts/template" element={<VoiceTemplatePromptsPage />} />
              <Route path="/inspection-templates" element={<InspectionTemplatesPage />} />
              <Route path="/inspection-templates/:id" element={<InspectionTemplateDetailPage />} />
              <Route path="/lookups" element={<LookupsIndexPage />} />
              <Route path="/lookups/:kind" element={<LookupManagePage />} />
            </Route>

            {/* BASIS_WORKFLOW — taken, notificaties, notities, favorieten */}
            <Route element={<FeatureRoute feature="BASIS_WORKFLOW" />}>
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/notities" element={<NotesPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
            </Route>

            {/* WORKFLOW_COMPLEET — documenten (DMS) */}
            <Route element={<FeatureRoute feature="WORKFLOW_COMPLEET" />}>
              <Route path="/documents" element={<DocumentsPage />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all → real 404 page. A static page (not a silent redirect to
            /dashboard) can never swallow a valid route during the load race. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
