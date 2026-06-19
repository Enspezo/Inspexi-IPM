import { IsOptional, IsString, IsInt, Min, Max, IsEnum, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateMode } from '@prisma/client';

export class UpdateDocumentTemplateDto {
  @ApiPropertyOptional({ example: 'A4' })
  @IsOptional()
  @IsString()
  pageSize?: string;

  @ApiPropertyOptional({ example: 'portrait' })
  @IsOptional()
  @IsString()
  orientation?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  marginTop?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  marginBottom?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  marginLeft?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  marginRight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headerHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  footerHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverPageHtml?: string;

  // Block editor velden
  @ApiPropertyOptional({ enum: TemplateMode })
  @IsOptional()
  @IsEnum(TemplateMode)
  templateMode?: TemplateMode;

  @ApiPropertyOptional({ type: [Object], description: 'ContentBlock[] voor BLOCKS-modus' })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  contentBlocks?: unknown[];

  // DOCX import velden
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docxStorageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docxFileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  docxFileSize?: number;
}
