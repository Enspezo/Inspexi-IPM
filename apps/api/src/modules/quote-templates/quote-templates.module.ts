import { Module } from '@nestjs/common';
import { QuoteTemplatesController } from './quote-templates.controller';
import { QuoteTemplatesService } from './quote-templates.service';
import { DocxRendererService } from './docx-renderer.service';

@Module({
  controllers: [QuoteTemplatesController],
  providers: [QuoteTemplatesService, DocxRendererService],
  exports: [QuoteTemplatesService, DocxRendererService],
})
export class QuoteTemplatesModule {}
