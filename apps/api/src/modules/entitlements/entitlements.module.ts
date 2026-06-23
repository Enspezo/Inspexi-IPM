import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';

/**
 * @Global zodat de (latere) FeatureGuard en SUPERUSER-beheer-laag de resolver
 * overal kunnen injecteren zonder de module per feature te hoeven importeren —
 * net als PrismaModule en TenantCacheModule. PrismaService is globaal
 * beschikbaar, dus PrismaModule hoeft hier niet geïmporteerd te worden.
 */
@Global()
@Module({
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
