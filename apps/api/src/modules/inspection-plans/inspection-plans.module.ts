import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { AiReviewModule } from '../ai-review/ai-review.module';
import { InspectionPlansController } from './inspection-plans.controller';
import { InspectionPlansService } from './inspection-plans.service';

// Dependency-richting (PRD-13 §13.7): InspectionPlansModule → AiReviewModule,
// nooit andersom — ai-review leest plannen via Prisma, dus geen cycle.
@Module({
  imports: [LookupModule, NotificationsModule, AssetNodesModule, AiReviewModule],
  controllers: [InspectionPlansController],
  providers: [InspectionPlansService],
  exports: [InspectionPlansService],
})
export class InspectionPlansModule {}
