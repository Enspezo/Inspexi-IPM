// Doel in apps/api: src/modules/asset-types/dto/ (gesplitst of als index)

import {
  ApiProperty, ApiPropertyOptional, PartialType, OmitType,
} from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, IsInt, Min, IsArray, IsUUID,
  IsEnum, IsObject, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssetFieldType } from '@prisma/client';

export class CreateAssetTypeDto {
  @ApiProperty({ example: 'verdeler' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Verdeelinrichting' })
  @IsString()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: 'Lucide-icon naam' }) @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional({ example: '#3B82F6' }) @IsOptional() @IsString() color?: string;

  @ApiPropertyOptional({ type: [String], description: 'Normcodes waarvoor dit type geldt' })
  @IsOptional() @IsArray() @IsString({ each: true })
  normTypes?: string[];

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

// code is niet wijzigbaar na aanmaken
export class UpdateAssetTypeDto extends PartialType(
  OmitType(CreateAssetTypeDto, ['code'] as const),
) {}

export class CreateAssetTypeFieldDto {
  @ApiProperty({ example: 'nominale_stroom' })
  @IsString() fieldKey: string;

  @ApiProperty({ example: 'Nominale stroom' })
  @IsString() label: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() helpText?: string;

  @ApiProperty({ enum: AssetFieldType })
  @IsEnum(AssetFieldType) fieldType: AssetFieldType;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() placeholder?: string;

  @ApiPropertyOptional({ description: 'JSON: {min,max,step,pattern,options[]}' })
  @IsOptional() @IsObject()
  validationRules?: Record<string, unknown>;

  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() displayWidth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groupName?: string;
}

export class UpdateAssetTypeFieldDto extends PartialType(
  OmitType(CreateAssetTypeFieldDto, ['fieldKey'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderFieldsDto {
  @ApiProperty({ type: [String] })
  @IsArray() @IsUUID('4', { each: true })
  fieldIds: string[];
}

export class ConstraintItemDto {
  @ApiPropertyOptional({ description: 'Toegestaan ouder-type (null = mag root zijn)' })
  @IsOptional() @IsUUID()
  allowedParentTypeId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isRequired?: boolean;
}

export class SetConstraintsDto {
  @ApiProperty({ type: [ConstraintItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConstraintItemDto)
  constraints: ConstraintItemDto[];
}

export class ValidateParentDto {
  @ApiProperty() @IsString() assetTypeCode: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentAssetTypeCode?: string;
}
