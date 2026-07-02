import { Module } from '@nestjs/common';
import { DocumentTagsController } from './document-tags.controller';
import { DocumentTagsService } from './document-tags.service';

@Module({
  controllers: [DocumentTagsController],
  providers: [DocumentTagsService],
  exports: [DocumentTagsService],
})
export class DocumentTagsModule {}
