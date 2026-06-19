import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MeasurementSheetFieldType,
  MeasurementSheetFieldWidth,
  PassFailOperator,
} from '@prisma/client';
import { DropdownOptionDto } from './create-field.dto';

export class UpdateMeasurementSheetFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: MeasurementSheetFieldType })
  @IsOptional()
  @IsEnum(MeasurementSheetFieldType)
  fieldType?: MeasurementSheetFieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;

  @ApiPropertyOptional({ enum: MeasurementSheetFieldWidth })
  @IsOptional()
  @IsEnum(MeasurementSheetFieldWidth)
  width?: MeasurementSheetFieldWidth;

  // Numerieke opties
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  decimals?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxValue?: number;

  // Dropdown-opties
  @ApiPropertyOptional({ type: [DropdownOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DropdownOptionDto)
  dropdownOptions?: DropdownOptionDto[];

  // Berekend veld
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  formula?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formulaDependencies?: string[];

  // Validatie
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  // Pass/fail-opties
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  passFailEnabled?: boolean;

  @ApiPropertyOptional({ enum: PassFailOperator })
  @IsOptional()
  @IsEnum(PassFailOperator)
  passFailOperator?: PassFailOperator;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  passFailValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  passFailMinValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  passFailMaxValue?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  passFailValues?: (string | number)[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  passFailFailMessage?: string;

  // Auto-finding-opties
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoFindingEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  autoFindingTemplateId?: string;

  // Herhalende-sectie-opties
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  copyValueOnNewRow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowBulkEdit?: boolean;
}
