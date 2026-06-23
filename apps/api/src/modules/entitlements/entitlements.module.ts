import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { FeaturesController } from './features.controller';

/**
 * @Global zodat de FeatureGuard en de SUPERUSER-beheer-laag de resolver overal
 * kunnen injecteren zonder de module per feature te hoeven importeren — net als
 * PrismaModule en TenantCacheModule. PrismaService is globaal beschikbaar, dus
 * PrismaModule hoeft hier niet geïmporteerd te worden.
 *
 * De controllers (Plan-CRUD + feature-catalogus, Fase 3) zijn SUPERUSER-only en
 * leveren de beheer-API; PlansService is niet exported (alleen via de controllers
 * gebruikt). EntitlementsService blijft exported voor de guard en org-overrides.
 */
@Global()
@Module({
  controllers: [PlansController, FeaturesController],
  providers: [EntitlementsService, PlansService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
