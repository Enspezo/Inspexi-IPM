import { Module } from '@nestjs/common';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';
import { DocumentGenerationModule } from '../document-generation/document-generation.module';

@Module({
  imports: [DocumentGenerationModule],
  controllers: [DocumentTemplatesController],
  providers: [DocumentTemplatesService],
  exports: [DocumentTemplatesService],
})
export class DocumentTemplatesModule {}
