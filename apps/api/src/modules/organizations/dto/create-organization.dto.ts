import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactDisplayMode, Role } from '@prisma/client';
import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsEmail,
  IsEnum,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'InspeXi Demo' })
  @IsString()
  @MinLength(2)
  name: string;

  // B-505: de slug wordt het subdomein — begrens hem op een geldig DNS-label
  // (2..63 tekens). De reserved-list (o.a. het geconfigureerde
  // SUPERUSER_SUBDOMAIN) is een runtime-check in OrganizationsService, omdat
  // class-validator geen ConfigService kan lezen.
  @ApiProperty({ example: 'inspexidemo', minLength: 2, maxLength: 63 })
  @IsString()
  @MinLength(2, { message: 'Slug moet minimaal 2 tekens bevatten' })
  @MaxLength(63, { message: 'Slug mag maximaal 63 tekens bevatten (DNS-label)' })
  @Matches(/^[a-z0-9]+$/, {
    message: 'Slug mag alleen kleine letters en cijfers bevatten (geen streepjes)',
  })
  slug: string;

  // B-511 §5 / beslispunt B5: dit veld draagt twee betekenissen — een externe
  // URL (handmatig gezet) én een interne storage-key (gezet door de
  // logo-uploadflow, bv. `logos/{id}/{uuid}.png`). `@IsUrl()` zou die uploadflow
  // breken; de kolomsplitsing (aparte `logoStorageKey`) is beslispunt B5.
  // Minimale hygiëne hier: lengte begrensd en geen uitvoerbare/inline-schema's
  // (javascript:/data:/vbscript:), want de waarde wordt als <img src> gerenderd.
  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(1024, { message: 'Logo-URL mag maximaal 1024 tekens bevatten' })
  @Matches(/^(?!\s*(?:javascript|data|vbscript):)/i, {
    message: 'Logo-URL mag geen script- of data-schema bevatten',
  })
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#1E40AF' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: 21 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultVat?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @ApiPropertyOptional({ example: 'InspeXi Demo' })
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional({ example: 'offerte@mijnbedrijf.nl' })
  @IsOptional()
  @IsEmail()
  senderEmail?: string;

  @ApiPropertyOptional({ example: 8, description: 'Start of working day (0–23)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  workdayStart?: number;

  @ApiPropertyOptional({ example: 17, description: 'End of working day (1–24)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  workdayEnd?: number;

  // ─── Zichtbaarheid inspecteur-contactgegevens in klantportaal (per kanaal) ───

  @ApiPropertyOptional({
    enum: ContactDisplayMode,
    description: 'Weergavemodus telefoonnummer inspecteur in klantportaal',
  })
  @IsOptional()
  @IsEnum(ContactDisplayMode)
  inspectorPhoneDisplay?: ContactDisplayMode;

  @ApiPropertyOptional({
    enum: ContactDisplayMode,
    description: 'Weergavemodus e-mailadres inspecteur in klantportaal',
  })
  @IsOptional()
  @IsEnum(ContactDisplayMode)
  inspectorEmailDisplay?: ContactDisplayMode;

  @ApiPropertyOptional({ example: '+31 20 123 4567', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.inspectorStaticPhone !== null)
  @IsString()
  inspectorStaticPhone?: string | null;

  @ApiPropertyOptional({ example: 'klantcontact@mijnbedrijf.nl', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.inspectorStaticEmail !== null && o.inspectorStaticEmail !== '')
  @IsEmail()
  inspectorStaticEmail?: string | null;

  // ─── Offerte-goedkeuring drempel (REQ5) ───

  @ApiPropertyOptional({
    example: 10000,
    nullable: true,
    description: 'Bedragdrempel; offertes strikt boven dit bedrag vereisen goedkeuring (null = geen drempel)',
  })
  @IsOptional()
  @ValidateIf((o) => o.quoteApprovalThreshold !== null)
  @IsNumber()
  @Min(0)
  quoteApprovalThreshold?: number | null;

  @ApiPropertyOptional({
    enum: Role,
    nullable: true,
    description: 'Vereiste rol/functie die offertes boven de drempel moet goedkeuren',
  })
  @IsOptional()
  @ValidateIf((o) => o.quoteApprovalRequiredRole !== null)
  @IsEnum(Role)
  quoteApprovalRequiredRole?: Role | null;

  @ApiPropertyOptional({
    example: false,
    description:
      'Vier-ogen op offertes (B-307): mag de aanvrager zijn eigen goedkeuringsverzoek afhandelen? Alleen aanzetten voor kleine organisaties met één goedkeurder.',
  })
  @IsOptional()
  @IsBoolean()
  quoteApprovalSelfApprovalAllowed?: boolean;
}
