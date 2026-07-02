import { PartialType } from '@nestjs/swagger';
import { CreateDocumentTagDto } from './create-document-tag.dto';

export class UpdateDocumentTagDto extends PartialType(CreateDocumentTagDto) {}
