import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';
import { QuoteTemplateType } from '@prisma/client';

export class CreateQuoteTemplateDto {
  @ApiProperty({ example: 'Standaard Inspectie Offerte' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: QuoteTemplateType, default: 'BLOCKS' })
  @IsOptional()
  @IsEnum(QuoteTemplateType)
  templateType?: QuoteTemplateType;

  @ApiPropertyOptional({ description: 'Template beschrijving' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Voorblad blokken (JSON, legacy)' })
  @IsOptional()
  coverBlocks?: any;

  @ApiPropertyOptional({ description: 'Content blokken (JSON array van ContentBlock objecten)' })
  @IsOptional()
  contentBlocks?: any;

  @ApiPropertyOptional({ description: 'Afsluitende blokken (JSON, legacy)' })
  @IsOptional()
  closingBlocks?: any;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}
