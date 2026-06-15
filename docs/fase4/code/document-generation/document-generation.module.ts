// Doel in apps/api: src/modules/document-generation/document-generation.module.ts
// Service-only module (geen controller). Geëxporteerd voor generated-documents.

import { Module } from '@nestjs/common';
import { PdfGenerationService } from './pdf-generation.service';
import { WordExportService } from './word-export.service';
import { DocumentRenderService } from './document-render.service';

@Module({
  providers: [PdfGenerationService, WordExportService, DocumentRenderService],
  exports: [PdfGenerationService, WordExportService, DocumentRenderService],
})
export class DocumentGenerationModule {}
