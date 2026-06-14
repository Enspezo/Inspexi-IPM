import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateLocationTypeFieldDto } from './create-location-type-field.dto';

export class UpdateLocationTypeFieldDto extends PartialType(
  OmitType(CreateLocationTypeFieldDto, ['fieldKey'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
