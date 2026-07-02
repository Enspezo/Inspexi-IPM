import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { ChatModule } from '../chat/chat.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';

@Module({
  imports: [ChatModule, AssetNodesModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
