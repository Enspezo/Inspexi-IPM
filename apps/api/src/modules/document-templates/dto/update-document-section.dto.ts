import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateDocumentSectionDto } from './create-document-section.dto';

// `code` is immutable en `sortOrder` wordt via de reorder-endpoint beheerd.
export class UpdateDocumentSectionDto extends PartialType(
  OmitType(CreateDocumentSectionDto, ['code', 'sortOrder'] as const),
) {}
