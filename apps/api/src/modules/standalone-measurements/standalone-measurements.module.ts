import { Module } from '@nestjs/common';
import { StandaloneMeasurementsController } from './standalone-measurements.controller';
import { StandaloneMeasurementsService } from './standalone-measurements.service';

@Module({
  controllers: [StandaloneMeasurementsController],
  providers: [StandaloneMeasurementsService],
  exports: [StandaloneMeasurementsService],
})
export class StandaloneMeasurementsModule {}
