import { Module } from '@nestjs/common';
import { MeasurementSheetRecordsController } from './measurement-sheet-records.controller';
import { MeasurementSheetRecordsService } from './measurement-sheet-records.service';

@Module({
  controllers: [MeasurementSheetRecordsController],
  providers: [MeasurementSheetRecordsService],
  exports: [MeasurementSheetRecordsService],
})
export class MeasurementSheetRecordsModule {}
