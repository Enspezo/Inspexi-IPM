// Doel in apps/api: src/modules/findings/findings.module.ts
import { Module } from '@nestjs/common';
import { LookupModule } from '../lookups/lookup.module';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  imports: [LookupModule],
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
