import { Module } from '@nestjs/common';
import { AssetTypesModule } from '../asset-types/asset-types.module';
import { LocationTypesModule } from '../location-types/location-types.module';
import { AssetNodesController } from './asset-nodes.controller';
import { AssetNodesService } from './asset-nodes.service';
import { TreeService } from './tree.service';

@Module({
  imports: [AssetTypesModule, LocationTypesModule],
  controllers: [AssetNodesController],
  providers: [AssetNodesService, TreeService],
  exports: [AssetNodesService],
})
export class AssetNodesModule {}
