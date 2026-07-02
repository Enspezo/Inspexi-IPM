import { Module } from '@nestjs/common';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { InspectionLocationsController } from './inspection-locations.controller';
import { InspectionLocationsService } from './inspection-locations.service';

@Module({
  imports: [AssetNodesModule],
  controllers: [InspectionLocationsController],
  providers: [InspectionLocationsService],
  exports: [InspectionLocationsService],
})
export class InspectionLocationsModule {}
