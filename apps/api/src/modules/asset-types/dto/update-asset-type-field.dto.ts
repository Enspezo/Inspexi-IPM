import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateAssetTypeFieldDto } from './create-asset-type-field.dto';

export class UpdateAssetTypeFieldDto extends PartialType(
  OmitType(CreateAssetTypeFieldDto, ['fieldKey'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
