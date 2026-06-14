import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConstraintItemDto {
  @ApiPropertyOptional({ description: 'Toegestaan ouder-type (null = mag root zijn)' })
  @IsOptional()
  @IsUUID()
  allowedParentTypeId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class SetConstraintsDto {
  @ApiProperty({ type: [ConstraintItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConstraintItemDto)
  constraints: ConstraintItemDto[];
}
