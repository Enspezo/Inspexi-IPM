import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SignatureImageDto } from '@/common';

/** Anonieme toegang: rapportnummer + postcode (PRD-14 §14.6). */
export class RepairLookupDto {
  @ApiProperty({ example: 'RAP-2026-001', description: 'Rapportnummer (referenceNumber van het plan)' })
  @IsString({ message: 'Rapportnummer is verplicht' })
  @IsNotEmpty({ message: 'Rapportnummer is verplicht' })
  @MaxLength(100)
  referenceNumber!: string;

  @ApiProperty({ example: '1234 AB', description: 'Postcode van het inspectieadres' })
  @IsString({ message: 'Postcode is verplicht' })
  @IsNotEmpty({ message: 'Postcode is verplicht' })
  @MaxLength(20)
  postalCode!: string;
}

/** Ingelogde klant start een herstelsessie op een toegankelijk plan. */
export class StartRepairSessionDto {
  @ApiProperty({ description: 'Inspectieplan-ID' })
  @IsUUID('4', { message: 'Ongeldig inspectieplan' })
  inspectionPlanId!: string;
}

/** Herstelmelding (claim) op één constatering. */
export class RepairResolveDto {
  @ApiProperty({ description: 'Omschrijving van de uitgevoerde werkzaamheden' })
  @IsString({ message: 'Omschrijving van de werkzaamheden is verplicht' })
  @IsNotEmpty({ message: 'Omschrijving van de werkzaamheden is verplicht' })
  @MaxLength(4000)
  description!: string;
}

/** Afronden: selectie van eigen meldingen + invullergegevens (fase 3). */
export class CompleteRepairDto {
  @ApiProperty({ description: 'IDs van eigen REPORTED-herstelmeldingen', type: [String] })
  @IsArray({ message: 'Selecteer minimaal één herstelmelding' })
  @ArrayNotEmpty({ message: 'Selecteer minimaal één herstelmelding' })
  @IsUUID('4', { each: true, message: 'Ongeldige herstelmelding geselecteerd' })
  resolutionIds!: string[];

  @ApiProperty({ description: 'Naam van de invuller' })
  @IsString({ message: 'Naam is verplicht' })
  @IsNotEmpty({ message: 'Naam is verplicht' })
  @MaxLength(200)
  contactName!: string;

  @ApiPropertyOptional({ description: 'Bedrijfsnaam (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ description: 'E-mailadres (verplicht bij anonieme sessies)' })
  @IsOptional()
  @IsEmail({}, { message: 'Ongeldig e-mailadres' })
  @MaxLength(320)
  email?: string;
}

/**
 * Ondertekenen van de herstelverklaring (fase 3). Het signatureImage-veld
 * (incl. @IsSafeDataImage) komt uit de gedeelde SignatureImageDto (B-404).
 */
export class SignRepairDto extends SignatureImageDto {}
