// Service-only module (geen controller). Geëxporteerd voor document-templates
// (en later generated-documents) zodat alle render-logica achter deze module zit.

import { Module } from '@nestjs/common';
import { PdfGenerationService } from './pdf-generation.service';
import { WordExportService } from './word-export.service';
import { DocumentRenderService } from './document-render.service';
import { BlockHtmlRendererService } from './renderers/block-html-renderer.service';

@Module({
  providers: [
    PdfGenerationService,
    WordExportService,
    DocumentRenderService,
    BlockHtmlRendererService,
  ],
  exports: [
    PdfGenerationService,
    WordExportService,
    DocumentRenderService,
    BlockHtmlRendererService,
  ],
})
export class DocumentGenerationModule {}
