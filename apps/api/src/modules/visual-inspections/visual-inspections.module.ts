import { Module } from '@nestjs/common';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { VisualInspectionsController } from './visual-inspections.controller';
import { VisualInspectionsService } from './visual-inspections.service';

@Module({
  imports: [AssetNodesModule],
  controllers: [VisualInspectionsController],
  providers: [VisualInspectionsService],
  exports: [VisualInspectionsService],
})
export class VisualInspectionsModule {}
