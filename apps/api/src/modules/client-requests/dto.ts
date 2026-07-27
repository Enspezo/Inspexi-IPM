import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';

// B-407 (WP-C2): lengtegrenzen conform de client-repair-tegenhanger. De
// omschrijvingen zijn Text-kolommen zonder DB-limiet; de UI eist zelf al
// minimaal 10 tekens — de backend hanteert nu dezelfde regel.

export class ReinspectionRequestDto {
  @ApiProperty({ description: 'Inspectie waarvoor herinspectie wordt aangevraagd' })
  @IsUUID()
  inspectionPlanId: string;

  @ApiProperty({ description: 'Omschrijving (10–4000 tekens)' })
  @IsString()
  @IsNotEmpty({ message: 'Omschrijving is verplicht' })
  @MinLength(10, { message: 'Omschrijving moet minimaal 10 tekens bevatten' })
  @MaxLength(4000, { message: 'Omschrijving mag maximaal 4000 tekens bevatten' })
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;
}

// org komt uit @CurrentTenant, NOOIT uit de body — daarom geen organizationId-veld.
export class NewAssignmentRequestDto {
  @ApiProperty({ description: 'Contact (opdrachtgever) waarvoor de opdracht geldt' })
  @IsUUID()
  contactId: string;

  @ApiProperty({ description: 'Onderwerp (max 200 tekens)' })
  @IsString()
  @IsNotEmpty({ message: 'Onderwerp is verplicht' })
  @MaxLength(200, { message: 'Onderwerp mag maximaal 200 tekens bevatten' })
  subject: string;

  @ApiProperty({ description: 'Omschrijving (10–4000 tekens)' })
  @IsString()
  @IsNotEmpty({ message: 'Omschrijving is verplicht' })
  @MinLength(10, { message: 'Omschrijving moet minimaal 10 tekens bevatten' })
  @MaxLength(4000, { message: 'Omschrijving mag maximaal 4000 tekens bevatten' })
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;
}
