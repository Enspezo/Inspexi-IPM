// Doel in apps/api: src/modules/asset-types/asset-types.module.ts
// Registreer in app.module.ts imports. Location-types is een 1-op-1 kopie van dit
// patroon (LocationTypeDefinition/Field/Constraint).

import { Module } from '@nestjs/common';
import { AssetTypesController } from './asset-types.controller';
import { AssetTypesService } from './asset-types.service';

@Module({
  controllers: [AssetTypesController],
  providers: [AssetTypesService],
  exports: [AssetTypesService],
})
export class AssetTypesModule {}
