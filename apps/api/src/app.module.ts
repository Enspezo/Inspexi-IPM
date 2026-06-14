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
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AllExceptionsFilter } from './common/filters';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';
import { EmailModule } from './common/services/email.module';
import { TenantCacheModule } from './common/services/tenant-cache.module';
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
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PlanningModule } from './modules/planning/planning.module';
import { SearchModule } from './modules/search/search.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { KvkModule } from './modules/kvk/kvk.module';
import { VatModule } from './modules/vat/vat.module';
import { ErrorReportsModule } from './modules/error-reports/error-reports.module';
import { NotesModule } from './modules/notes/notes.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { LookupModule } from './modules/lookups/lookup.module';
import { InspectionPlansModule } from './modules/inspection-plans/inspection-plans.module';
import { AssetTypesModule } from './modules/asset-types/asset-types.module';
import { AssetsModule } from './modules/assets/assets.module';
import { FindingsModule } from './modules/findings/findings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global rate limiting: 120 requests / 60s per IP (in-memory store).
    // Sensitive routes tighten this with @Throttle(); see auth.controller.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
    PrismaModule,
    TenantCacheModule,
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
    WebhooksModule,
    PlanningModule,
    SearchModule,
    GeocodingModule,
    CustomFieldsModule,
    EmailTemplatesModule,
    ProjectsModule,
    KvkModule,
    VatModule,
    ErrorReportsModule,
    NotesModule,
    WorkOrdersModule,
    LookupModule,
    // Inspectiedomein Fase 2 — uitvoering + config
    InspectionPlansModule,
    AssetTypesModule,
    AssetsModule,
    FindingsModule,
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
