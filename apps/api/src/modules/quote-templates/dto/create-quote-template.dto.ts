import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CreateQuoteTemplateDto {
  @ApiProperty({ example: 'Standaard Inspectie Offerte' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Voorblad blokken (JSON)' })
  @IsOptional()
  coverBlocks?: any;

  @ApiPropertyOptional({ description: 'Inhoud blokken (JSON)' })
  @IsOptional()
  contentBlocks?: any;

  @ApiPropertyOptional({ description: 'Afsluitende blokken (JSON)' })
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
