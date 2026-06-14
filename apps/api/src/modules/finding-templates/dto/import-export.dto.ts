import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Categorienaam (wordt opgezocht binnen org of systeem)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty()
  @IsString()
  shortDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normReference?: string;

  @ApiProperty({ description: 'Code van het classificatiemodel' })
  @IsString()
  classificationModelCode: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  defaultClassification?: Record<string, string>;
}

export class ImportFindingTemplatesDto {
  @ApiProperty()
  @IsString()
  exportVersion: string;

  @ApiProperty({ type: [ImportTemplateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTemplateDto)
  findingTemplates: ImportTemplateDto[];
}

export class ExportFindingTemplatesDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}

/** Export-formaat (response shape). */
export interface FindingTemplateExport {
  exportVersion: string;
  exportedAt: string;
  exportedBy: string;
  findingTemplates: {
    code?: string;
    category?: string;
    shortDescription: string;
    longDescription?: string;
    explanation?: string;
    normReference?: string;
    classificationModelCode?: string;
    defaultClassification?: Record<string, string>;
  }[];
}
