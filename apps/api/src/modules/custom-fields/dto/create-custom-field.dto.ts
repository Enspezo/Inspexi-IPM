import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CustomFieldType, CustomFieldEntityType } from '@prisma/client';

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CustomFieldEntityType })
  @IsEnum(CustomFieldEntityType)
  entityType: CustomFieldEntityType;

  @ApiProperty({ example: 'Certificaatnummer' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @ApiProperty({ enum: CustomFieldType })
  @IsEnum(CustomFieldType)
  fieldType: CustomFieldType;

  @ApiPropertyOptional({ example: ['Optie A', 'Optie B'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
