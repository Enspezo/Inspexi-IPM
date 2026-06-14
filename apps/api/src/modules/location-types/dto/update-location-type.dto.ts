import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLocationTypeDto } from './create-location-type.dto';

// code is niet wijzigbaar na aanmaken
export class UpdateLocationTypeDto extends PartialType(
  OmitType(CreateLocationTypeDto, ['code'] as const),
) {}
