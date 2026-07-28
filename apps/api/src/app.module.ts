import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AccessLogMiddleware } from './common/middleware/access-log.middleware';
import { PrismaModule } from './prisma';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { FeatureGuard } from './common/guards/feature.guard';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AllExceptionsFilter } from './common/filters';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';
import { SupportAccessInterceptor } from './common/interceptors/support-access.interceptor';
import { EmailModule } from './common/services/email.module';
import { TenantCacheModule } from './common/services/tenant-cache.module';
import { EnumerationGuardModule } from './common/services/enumeration-guard.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { UsersModule } from './modules/users/users.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CustomerGroupsModule } from './modules/customer-groups/customer-groups.module';
import { ProductGroupsModule } from './modules/product-groups/product-groups.module';
import { ProductsModule } from './modules/products/products.module';
import { PriceTablesModule } from './modules/price-tables/price-tables.module';
import { RequestsModule } from './modules/requests/requests.module';
import { QuoteTemplatesModule } from './modules/quote-templates/quote-templates.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { StorageModule } from './common/services/storage/storage.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DocumentTagsModule } from './modules/document-tags/document-tags.module';
import { InspectorCertificatesModule } from './modules/inspector-certificates/inspector-certificates.module';
import { MeasurementInstrumentsModule } from './modules/measurement-instruments/measurement-instruments.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PlanningModule } from './modules/planning/planning.module';
import { SearchModule } from './modules/search/search.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { NumberingModule } from './modules/numbering/numbering.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ProjectPhasesModule } from './modules/project-phases/project-phases.module';
import { KvkModule } from './modules/kvk/kvk.module';
import { VatModule } from './modules/vat/vat.module';
import { HealthModule } from './modules/health/health.module';
import { ErrorReportsModule } from './modules/error-reports/error-reports.module';
import { HelpModule } from './modules/help/help.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { NotesModule } from './modules/notes/notes.module';
import { ChatModule } from './modules/chat/chat.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { LookupModule } from './modules/lookups/lookup.module';
import { InspectionPlansModule } from './modules/inspection-plans/inspection-plans.module';
import { AssetTypesModule } from './modules/asset-types/asset-types.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AssetNodesModule } from './modules/asset-nodes/asset-nodes.module';
import { FindingsModule } from './modules/findings/findings.module';
import { NormTypesModule } from './modules/norm-types/norm-types.module';
import { ClassificationModelsModule } from './modules/classification-models/classification-models.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { FindingTemplatesModule } from './modules/finding-templates/finding-templates.module';
import { LocationTypesModule } from './modules/location-types/location-types.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { MeasurementSheetTemplatesModule } from './modules/measurement-sheet-templates/measurement-sheet-templates.module';
import { InspectionTemplatesModule } from './modules/inspection-templates/inspection-templates.module';
import { DocumentGenerationModule } from './modules/document-generation/document-generation.module';
import { DocumentTemplatesModule } from './modules/document-templates/document-templates.module';
import { InspectionLocationsModule } from './modules/inspection-locations/inspection-locations.module';
import { VisualInspectionsModule } from './modules/visual-inspections/visual-inspections.module';
import { MeasurementRecordsModule } from './modules/measurement-records/measurement-records.module';
import { MeasurementSheetRecordsModule } from './modules/measurement-sheet-records/measurement-sheet-records.module';
import { StandaloneMeasurementsModule } from './modules/standalone-measurements/standalone-measurements.module';
import { LocationImagesModule } from './modules/location-images/location-images.module';
import { PortalStatsModule } from './modules/portal-stats/portal-stats.module';
import { SyncModule } from './modules/sync/sync.module';
import { PhotosModule } from './modules/photos/photos.module';
import { GeneratedDocumentsModule } from './modules/generated-documents/generated-documents.module';
// Inspectiedomein Fase 6 — client-portal (2e auth-realm + klant-endpoints)
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { ClientInspectionsModule } from './modules/client-inspections/client-inspections.module';
import { ClientDocumentsModule } from './modules/client-documents/client-documents.module';
import { ClientFindingsModule } from './modules/client-findings/client-findings.module';
import { ClientMessagesModule } from './modules/client-messages/client-messages.module';
import { ClientRequestsModule } from './modules/client-requests/client-requests.module';
import { ClientLookupsModule } from './modules/client-lookups/client-lookups.module';
import { ClientHelpModule } from './modules/client-help/client-help.module';
import { ClientRepairModule } from './modules/client-repair/client-repair.module';
// Inspectiedomein Fase 7 — voice-input (AI spraak-naar-meting + 3-lagen prompts)
import { VoiceModule } from './modules/voice/voice.module';
// Gedeelde Anthropic-client (PRD-13 §13.6.1) — @Global, gebruikt door voice + ai-review
import { AnthropicModule } from './common/services/anthropic/anthropic.module';
// AI-voorcontrole van inspectierapporten (PRD-13)
import { AiReviewModule } from './modules/ai-review/ai-review.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global rate limiting: 120 requests / 60s per IP (in-memory store).
    // Sensitive routes tighten this with @Throttle(); see auth.controller.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
    PrismaModule,
    TenantCacheModule,
    // Per-IP throttle op mislukte org-subdomein-lookups (anti-enumeratie).
    EnumerationGuardModule,
    // SaaS-abonnementen & feature-entitlements (PRD-09, Fase 0 — resolver only,
    // nog geen enforcement). @Global: levert EntitlementsService app-breed.
    EntitlementsModule,
    EmailModule,
    NotificationsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ContactsModule,
    CustomerGroupsModule,
    ProductGroupsModule,
    ProductsModule,
    PriceTablesModule,
    RequestsModule,
    QuoteTemplatesModule,
    QuotesModule,
    AuditLogModule,
    TasksModule,
    StorageModule,
    DocumentsModule,
    DocumentTagsModule,
    InspectorCertificatesModule,
    MeasurementInstrumentsModule,
    AvailabilityModule,
    WebhooksModule,
    PlanningModule,
    SearchModule,
    GeocodingModule,
    CustomFieldsModule,
    NumberingModule,
    EmailTemplatesModule,
    ProjectsModule,
    ProjectPhasesModule,
    KvkModule,
    VatModule,
    ErrorReportsModule,
    HelpModule,
    SupportTicketsModule,
    NotesModule,
    ChatModule,
    AiAgentModule,
    FavoritesModule,
    WorkOrdersModule,
    LookupModule,
    // Inspectiedomein Fase 2 — uitvoering + config
    InspectionPlansModule,
    AssetTypesModule,
    AssetsModule,
    AssetNodesModule,
    FindingsModule,
    NormTypesModule,
    ClassificationModelsModule,
    CategoriesModule,
    FindingTemplatesModule,
    LocationTypesModule,
    ChecklistsModule,
    MeasurementSheetTemplatesModule,
    InspectionTemplatesModule,
    DocumentGenerationModule,
    DocumentTemplatesModule,
    InspectionLocationsModule,
    VisualInspectionsModule,
    MeasurementRecordsModule,
    MeasurementSheetRecordsModule,
    StandaloneMeasurementsModule,
    LocationImagesModule,
    PortalStatsModule,
    // Inspectiedomein Fase 3 — PWA-sync + foto-upload
    SyncModule,
    PhotosModule,
    // Inspectiedomein Fase 4 — gegenereerde documenten + ondertekening
    GeneratedDocumentsModule,
    // Inspectiedomein Fase 6 — client-portal (2e auth-realm + klant-endpoints)
    ClientAuthModule,
    ClientInspectionsModule,
    ClientDocumentsModule,
    ClientFindingsModule,
    ClientMessagesModule,
    ClientRequestsModule,
    ClientLookupsModule,
    ClientHelpModule,
    ClientRepairModule,
    // Inspectiedomein Fase 7 — voice-input (AI spraak-naar-meting + 3-lagen prompts)
    VoiceModule,
    // Gedeelde Anthropic-client + AI-voorcontrole van inspectierapporten (PRD-13)
    AnthropicModule,
    AiReviewModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
    // IMP_PRD-10 Fase 5 — logt ACCESSED wanneer een SUPERUSER een org-subdomein
    // bekijkt terwijl support-toegang aanstaat (org-status uit de tenant-cache).
    {
      provide: APP_INTERCEPTOR,
      useClass: SupportAccessInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    // Feature-entitlements (PRD-09 §5.1) — ná TenantGuard. Werkt alleen op routes
    // met @RequiresFeature(...); core/platform-routes blijven ongemoeid.
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    // Na RequestIdMiddleware zodat req.requestId beschikbaar is in de access log.
    consumer.apply(AccessLogMiddleware).forRoutes('*');
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
