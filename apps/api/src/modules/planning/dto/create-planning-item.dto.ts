import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsDateString, IsNumber, Min, IsArray, IsBoolean, IsInt, Max } from 'class-validator';

export class CreatePlanningItemDto {
  @ApiProperty({ example: 'uuid', description: 'Contact ID (opdrachtgever)' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Locatie ID (optioneel)' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Offerte ID (optioneel)' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Contactpersoon ID (optioneel)' })
  @IsOptional()
  @IsUUID()
  contactPersonId?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Product ID (optioneel)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ example: 'NEN1010 Inspectie', description: 'Naam van de dienst/product' })
  @IsString()
  productName: string;

  @ApiPropertyOptional({ example: '2026-03-15T09:00:00Z', description: 'Geplande startdatum en -tijd' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Duur in uren (bijv. 1.25 = 1u15m)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @ApiPropertyOptional({ example: 'Toegang via achterdeur', description: 'Interne notitie' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ example: ['Urgent'], description: 'Labels' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({ example: false, description: 'Meerdaagse planning (meerdere sessies)' })
  @IsOptional()
  @IsBoolean()
  isMultiDay?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'Aantal sessies (verplicht bij isMultiDay = true, min. 2, max. 30)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  sessionCount?: number;
}
