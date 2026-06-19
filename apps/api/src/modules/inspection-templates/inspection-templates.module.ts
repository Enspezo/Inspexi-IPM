import { Module } from '@nestjs/common';
import { InspectionTemplatesController } from './inspection-templates.controller';
import { InspectionTemplatesService } from './inspection-templates.service';

@Module({
  controllers: [InspectionTemplatesController],
  providers: [InspectionTemplatesService],
  exports: [InspectionTemplatesService],
})
export class InspectionTemplatesModule {}
