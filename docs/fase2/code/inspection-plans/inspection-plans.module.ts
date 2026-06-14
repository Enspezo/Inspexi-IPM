// Doel in apps/api: src/modules/inspection-plans/inspection-plans.module.ts
// Registreer in app.module.ts imports. Importeert LookupModule voor *Code-resolutie.

import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { InspectionPlansController } from './inspection-plans.controller';
import { InspectionPlansService } from './inspection-plans.service';

@Module({
  imports: [LookupModule],
  controllers: [InspectionPlansController],
  providers: [InspectionPlansService],
  exports: [InspectionPlansService],
})
export class InspectionPlansModule {}
