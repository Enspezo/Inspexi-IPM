import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RowValidationRuleDto } from './create-section.dto';

export class UpdateMeasurementSheetSectionDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRepeating?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minRows?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  collapsible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultCollapsed?: boolean;

  @ApiPropertyOptional({ type: [RowValidationRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowValidationRuleDto)
  rowValidationRules?: RowValidationRuleDto[];
}
