import { Module } from '@nestjs/common';
import { AssetTypesModule } from '../asset-types/asset-types.module';
import { LookupModule } from '../lookups/lookup.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AssetTypesModule, LookupModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
