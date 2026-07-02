import { Module } from '@nestjs/common';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { MeasurementRecordsController } from './measurement-records.controller';
import { MeasurementRecordsService } from './measurement-records.service';

@Module({
  imports: [AssetNodesModule],
  controllers: [MeasurementRecordsController],
  providers: [MeasurementRecordsService],
  exports: [MeasurementRecordsService],
})
export class MeasurementRecordsModule {}
