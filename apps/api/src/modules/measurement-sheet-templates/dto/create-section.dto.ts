import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MinLength,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RowValidationRuleDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldCodes?: string[];
}

export class CreateMeasurementSheetSectionDto {
  @ApiProperty({ example: 'algemeen' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Code mag alleen kleine letters, cijfers en underscores bevatten',
  })
  code: string;

  @ApiProperty({ example: 'Algemene gegevens' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

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
  @IsInt()
  @Min(0)
  sortOrder?: number;

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
