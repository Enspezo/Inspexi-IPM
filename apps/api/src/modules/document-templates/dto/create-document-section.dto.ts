import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SectionType } from '@prisma/client';

export class CreateDocumentSectionDto {
  @ApiProperty({ example: 'inleiding' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Inleiding' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: SectionType, example: SectionType.STATIC })
  @IsEnum(SectionType, { message: 'sectionType moet een geldig sectietype zijn' })
  sectionType: SectionType;

  @ApiPropertyOptional({ description: 'Handlebars-HTML voor STATIC/CONDITIONAL secties' })
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @ApiPropertyOptional({ example: 'assets', description: 'Context-array waarover herhaald wordt' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  repeatOn?: string;

  @ApiPropertyOptional({ description: 'Handlebars-item-template voor REPEATING secties' })
  @IsOptional()
  @IsString()
  repeatItemTemplate?: string;

  @ApiPropertyOptional({ example: 'findings.length > 0' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  condition?: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeInToc?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pageBreakBefore?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pageBreakAfter?: boolean;

  @ApiPropertyOptional({ description: 'Parent-sectie voor geneste secties' })
  @IsOptional()
  @IsString()
  parentSectionId?: string;
}
