import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { InspectionPlansController } from './inspection-plans.controller';
import { InspectionPlansService } from './inspection-plans.service';

@Module({
  imports: [LookupModule, NotificationsModule, AssetNodesModule],
  controllers: [InspectionPlansController],
  providers: [InspectionPlansService],
  exports: [InspectionPlansService],
})
export class InspectionPlansModule {}
