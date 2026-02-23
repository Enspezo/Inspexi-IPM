import { PartialType } from '@nestjs/swagger';
import { CreateQuoteTemplateDto } from './create-quote-template.dto';

export class UpdateQuoteTemplateDto extends PartialType(
  CreateQuoteTemplateDto,
) {}
