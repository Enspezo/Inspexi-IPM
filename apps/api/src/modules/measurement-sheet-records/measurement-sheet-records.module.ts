import { Module } from '@nestjs/common';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { MeasurementSheetRecordsController } from './measurement-sheet-records.controller';
import { MeasurementSheetRecordsService } from './measurement-sheet-records.service';

@Module({
  imports: [AssetNodesModule],
  controllers: [MeasurementSheetRecordsController],
  providers: [MeasurementSheetRecordsService],
  exports: [MeasurementSheetRecordsService],
})
export class MeasurementSheetRecordsModule {}
