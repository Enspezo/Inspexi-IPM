import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsInt,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImportItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsString()
  question: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  isRequired: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultFindingTemplateCodes?: string[];
}

class ImportChecklistDataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Normcode (verwijst naar NormTypeDefinition)' })
  @IsString()
  normTypeCode: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;
}

export class ImportChecklistDto {
  @ApiProperty({ example: '1.0' })
  @IsString()
  exportVersion: string;

  @ApiProperty({ type: ImportChecklistDataDto })
  @ValidateNested()
  @Type(() => ImportChecklistDataDto)
  checklist: ImportChecklistDataDto;

  @ApiProperty({ type: [ImportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  items: ImportItemDto[];
}
