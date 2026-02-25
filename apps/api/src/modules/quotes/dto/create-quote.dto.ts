import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsDateString, IsObject } from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ description: 'Relatie ID' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ description: 'Locatie ID' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Aanvraag ID' })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({ description: 'Template ID' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiProperty({ example: 'NEN1010 inspectie kantoorpand' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: 'Geldig tot datum' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Interne notities' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Inhoud blokken (TipTap JSON)' })
  @IsOptional()
  @IsObject()
  contentBlocks?: Record<string, any>;
}
