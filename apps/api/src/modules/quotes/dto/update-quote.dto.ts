import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class UpdateQuoteDto {
  @ApiPropertyOptional({ example: 'NEN1010 inspectie kantoorpand' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Relatie ID' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Locatie ID' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Geldig tot datum' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Interne notities' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Voorblad blokken (JSON)' })
  @IsOptional()
  coverBlocks?: any;

  @ApiPropertyOptional({ description: 'Inhoud blokken (JSON)' })
  @IsOptional()
  contentBlocks?: any;

  @ApiPropertyOptional({ description: 'Afsluitende blokken (JSON)' })
  @IsOptional()
  closingBlocks?: any;
}
