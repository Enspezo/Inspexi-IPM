import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsEnum,
  IsObject,
} from 'class-validator';
import { AssetFieldType } from '@prisma/client';

export class CreateLocationTypeFieldDto {
  @ApiProperty({ example: 'bouwjaar' })
  @IsString()
  fieldKey: string;

  @ApiProperty({ example: 'Bouwjaar' })
  @IsString()
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  helpText?: string;

  @ApiProperty({ enum: AssetFieldType })
  @IsEnum(AssetFieldType)
  fieldType: AssetFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeholder?: string;

  @ApiPropertyOptional({ description: 'JSON: {min,max,step,pattern,options[]}' })
  @IsOptional()
  @IsObject()
  validationRules?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayWidth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupName?: string;
}
