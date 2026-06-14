import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateChecklistDto } from './create-checklist.dto';

// isSystem is niet wijzigbaar na aanmaken
export class UpdateChecklistDto extends PartialType(
  OmitType(CreateChecklistDto, ['isSystem'] as const),
) {}
