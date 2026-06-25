import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Certificaat aanmaken. Wordt als `multipart/form-data` ontvangen (optioneel
 * `file`-veld), dus alle waarden komen als string binnen; datums zijn ISO-strings
 * die de service naar `Date` omzet.
 */
export class CreateInspectorCertificateDto {
  @ApiProperty({ description: 'ID van de inspecteur waar dit certificaat bij hoort' })
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  userId: string;

  @ApiProperty({ example: 'VCA-VOL', description: 'Soort certificaat/diploma' })
  @IsString()
  @IsNotEmpty({ message: 'Soort is verplicht' })
  @MaxLength(200, { message: 'Soort mag maximaal 200 tekens bevatten' })
  type: string;

  @ApiPropertyOptional({ example: 'NL-12345', description: 'Certificaatnummer (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Nummer mag maximaal 120 tekens bevatten' })
  number?: string;

  @ApiProperty({ example: '2024-01-15', description: 'Datum van afgifte (ISO)' })
  @IsDateString({}, { message: 'Ongeldige datum' })
  issueDate: string;

  @ApiPropertyOptional({ example: '2027-01-15', description: 'Geldig tot (ISO, optioneel)' })
  @IsOptional()
  // Een leeg veld in het formulier betekent "geen einddatum" — sla validatie over.
  @ValidateIf((o) => o.validUntil !== '' && o.validUntil !== null && o.validUntil !== undefined)
  @IsDateString({}, { message: 'Ongeldige geldigheidsdatum' })
  validUntil?: string;

  @ApiProperty({ example: 'VCA Examenbureau', description: 'Uitgevende instantie' })
  @IsString()
  @IsNotEmpty({ message: 'Instantie is verplicht' })
  @MaxLength(200, { message: 'Instantie mag maximaal 200 tekens bevatten' })
  issuer: string;
}
