import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { TombstoneCleanupService } from './tombstone-cleanup.service';
import { ChatModule } from '../chat/chat.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { InspectionPlansModule } from '../inspection-plans/inspection-plans.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';

// InspectionPlansModule levert de gedeelde submit-side-effects (WP-C3/B-218):
// een sync-push naar pending_review start dezelfde notificatie + AI-voorcontrole
// als de REST-submit. Dependency-richting: SyncModule → InspectionPlansModule,
// nooit andersom (geen cycle — inspection-plans kent de sync niet).
@Module({
  imports: [ChatModule, AssetNodesModule, InspectionPlansModule, TimeTrackingModule],
  controllers: [SyncController],
  providers: [SyncService, TombstoneCleanupService],
  exports: [SyncService],
})
export class SyncModule {}
