import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { AssetNodesModule } from '../asset-nodes/asset-nodes.module';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  imports: [LookupModule, AssetNodesModule],
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
