import { Module } from '@nestjs/common';
import { FindingTemplatesController } from './finding-templates.controller';
import { FindingTemplatesService } from './finding-templates.service';

@Module({
  controllers: [FindingTemplatesController],
  providers: [FindingTemplatesService],
  exports: [FindingTemplatesService],
})
export class FindingTemplatesModule {}
