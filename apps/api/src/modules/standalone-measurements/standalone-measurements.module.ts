import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { StandaloneMeasurementsController } from './standalone-measurements.controller';
import { StandaloneMeasurementsService } from './standalone-measurements.service';

@Module({
  imports: [LookupModule],
  controllers: [StandaloneMeasurementsController],
  providers: [StandaloneMeasurementsService],
  exports: [StandaloneMeasurementsService],
})
export class StandaloneMeasurementsModule {}
