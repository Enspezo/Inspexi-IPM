import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  IsEmail,
  Matches,
  MaxLength,
  IsNumber,
  IsBoolean,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { EmploymentType } from '@prisma/client';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ example: 'Jan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional({ example: 'de Vries' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: 'jan@bedrijf.nl' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'JDV', description: 'Initialen (max 4 letters A-Z)' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: 'Initialen mogen alleen hoofdletters bevatten (A-Z)' })
  initials?: string;

  @ApiPropertyOptional({ example: 'Hoofdstraat' })
  @IsOptional()
  @IsString()
  homeStreet?: string | null;

  @ApiPropertyOptional({ example: '1A' })
  @IsOptional()
  @IsString()
  homeHouseNumber?: string | null;

  @ApiPropertyOptional({ example: '1234AB' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  homePostalCode?: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam' })
  @IsOptional()
  @IsString()
  homeCity?: string | null;

  @ApiPropertyOptional({ example: 52.3702 })
  @IsOptional()
  @IsNumber()
  homeLat?: number | null;

  @ApiPropertyOptional({ example: 4.8952 })
  @IsOptional()
  @IsNumber()
  homeLng?: number | null;

  // ─── Klantportaal-contactgegevens (los van login-`email`) ───
  // Mag door een ORG_ADMIN/SUPERUSER namens de inspecteur worden beheerd.

  @ApiPropertyOptional({ example: '+31 6 12345678', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.contactPhone !== null)
  @IsString()
  contactPhone?: string | null;

  @ApiPropertyOptional({ example: 'tom.visser@bedrijf.nl', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.contactEmail !== null && o.contactEmail !== '')
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ description: 'Toestemming telefoonnummer in klantportaal te tonen' })
  @IsOptional()
  @IsBoolean()
  sharePhoneWithClients?: boolean;

  @ApiPropertyOptional({ description: 'Toestemming e-mailadres in klantportaal te tonen' })
  @IsOptional()
  @IsBoolean()
  shareEmailWithClients?: boolean;

  // ─── Beschikbaarheid (PRD-12) ───
  // Dienstvorm van een inspecteur. Alleen te wijzigen door MANAGEMENT_ROLES
  // (service dwingt dit af; 403 anders).
  @ApiPropertyOptional({ enum: EmploymentType, nullable: true, description: 'Dienstvorm inspecteur' })
  @IsOptional()
  @ValidateIf((o) => o.employmentType !== null)
  @IsEnum(EmploymentType, { message: 'Ongeldige dienstvorm' })
  employmentType?: EmploymentType | null;
}
