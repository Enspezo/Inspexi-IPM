import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { TombstoneCleanupService } from './tombstone-cleanup.service';
import { ChatModule } from '../chat/chat.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';

@Module({
  imports: [ChatModule, AssetNodesModule],
  controllers: [SyncController],
  providers: [SyncService, TombstoneCleanupService],
  exports: [SyncService],
})
export class SyncModule {}
