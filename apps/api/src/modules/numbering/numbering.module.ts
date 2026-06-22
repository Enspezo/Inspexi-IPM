import { Global, Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { NumberingSchemesController } from './numbering-schemes.controller';

/**
 * @Global so the four consumer modules (requests/quotes/projects/products) can
 * inject NumberingService without import wiring — it is a cross-cutting utility,
 * like StorageModule / TenantCacheModule.
 */
@Global()
@Module({
  controllers: [NumberingSchemesController],
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
