import { Module } from '@nestjs/common';
import { MeasurementRecordsController } from './measurement-records.controller';
import { MeasurementRecordsService } from './measurement-records.service';

@Module({
  controllers: [MeasurementRecordsController],
  providers: [MeasurementRecordsService],
  exports: [MeasurementRecordsService],
})
export class MeasurementRecordsModule {}
