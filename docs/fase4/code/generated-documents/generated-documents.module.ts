// Doel in apps/api: src/modules/generated-documents/generated-documents.module.ts
import { Module } from '@nestjs/common';
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import {
  GeneratedDocumentsController,
  SignatureRequestsController,
} from './generated-documents.controller';
import { GeneratedDocumentsService } from './generated-documents.service';

@Module({
  imports: [DocumentGenerationModule],
  controllers: [GeneratedDocumentsController, SignatureRequestsController],
  providers: [GeneratedDocumentsService],
  exports: [GeneratedDocumentsService],
})
export class GeneratedDocumentsModule {}
