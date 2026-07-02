import { Module } from '@nestjs/common';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AssetNodesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
