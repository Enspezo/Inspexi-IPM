import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateIf, IsString, IsOptional, IsUUID, IsDateString, IsObject, MaxLength } from 'class-validator';

export class UpdateQuoteDto {
  @ApiPropertyOptional({ description: 'Handmatig offertenummer (alleen als handmatige nummering aanstaat)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  quoteNumber?: string;

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

  @ApiPropertyOptional({ description: 'Template ID (null om het sjabloon te ontkoppelen, alleen in CONCEPT)', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  templateId?: string | null;

  @ApiPropertyOptional({ description: 'Projectfase ID (null om te ontkoppelen). Moet bij hetzelfde project horen (PRD-12).', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  projectPhaseId?: string | null;

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

  @ApiPropertyOptional({ description: 'Eigen velden (key-value JSON)' })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
