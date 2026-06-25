import { Module } from '@nestjs/common';
import { MeasurementInstrumentsController } from './measurement-instruments.controller';
import { MeasurementInstrumentsService } from './measurement-instruments.service';
import { MeasurementInstrumentsScheduler } from './measurement-instruments.scheduler';

@Module({
  controllers: [MeasurementInstrumentsController],
  providers: [MeasurementInstrumentsService, MeasurementInstrumentsScheduler],
  exports: [MeasurementInstrumentsService],
})
export class MeasurementInstrumentsModule {}
