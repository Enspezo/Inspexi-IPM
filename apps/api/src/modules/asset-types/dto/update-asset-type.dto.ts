import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAssetTypeDto } from './create-asset-type.dto';

// code is niet wijzigbaar na aanmaken
export class UpdateAssetTypeDto extends PartialType(
  OmitType(CreateAssetTypeDto, ['code'] as const),
) {}
