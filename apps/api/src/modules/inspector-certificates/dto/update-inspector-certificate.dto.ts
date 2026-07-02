import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Certificaat bijwerken. Ook `multipart/form-data` (optioneel een nieuw `file`
 * dat het bestaande bestand vervangt). `userId` is bewust niet wijzigbaar — een
 * certificaat verhuist niet naar een andere gebruiker. Een leeg `number` /
 * `validUntil` wist het veld in de service.
 */
export class UpdateInspectorCertificateDto {
  @ApiPropertyOptional({ example: 'VCA-VOL' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Soort mag niet leeg zijn' })
  @MaxLength(200, { message: 'Soort mag maximaal 200 tekens bevatten' })
  type?: string;

  @ApiPropertyOptional({ example: 'NL-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Nummer mag maximaal 120 tekens bevatten' })
  number?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @ValidateIf((o) => o.issueDate !== '' && o.issueDate !== null && o.issueDate !== undefined)
  @IsDateString({}, { message: 'Ongeldige datum' })
  issueDate?: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @ValidateIf((o) => o.validUntil !== '' && o.validUntil !== null && o.validUntil !== undefined)
  @IsDateString({}, { message: 'Ongeldige geldigheidsdatum' })
  validUntil?: string;

  @ApiPropertyOptional({ example: 'VCA Examenbureau' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Instantie mag niet leeg zijn' })
  @MaxLength(200, { message: 'Instantie mag maximaal 200 tekens bevatten' })
  issuer?: string;
}
