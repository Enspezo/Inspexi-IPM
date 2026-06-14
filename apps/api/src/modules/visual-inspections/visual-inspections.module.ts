import { Module } from '@nestjs/common';
import { VisualInspectionsController } from './visual-inspections.controller';
import { VisualInspectionsService } from './visual-inspections.service';

@Module({
  controllers: [VisualInspectionsController],
  providers: [VisualInspectionsService],
  exports: [VisualInspectionsService],
})
export class VisualInspectionsModule {}
