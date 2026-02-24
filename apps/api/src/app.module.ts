import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { PrismaModule } from './prisma';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { AllExceptionsFilter } from './common/filters';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';
import { EmailModule } from './common/services/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { UsersModule } from './modules/users/users.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CustomerGroupsModule } from './modules/customer-groups/customer-groups.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailModule,
    NotificationsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ContactsModule,
    CustomerGroupsModule,
    ProductsModule,
    PriceTablesModule,
    RequestsModule,
    QuoteTemplatesModule,
    QuotesModule,
    AuditLogModule,
    TasksModule,
    StorageModule,
    DocumentsModule,
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
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
