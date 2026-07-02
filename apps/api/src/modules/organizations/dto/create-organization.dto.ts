import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactDisplayMode, Role } from '@prisma/client';
import {
  IsString,
  MinLength,
  Matches,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsEmail,
  IsEnum,
  ValidateIf,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'InspeXi Demo' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'inspexidemo' })
  @IsString()
  @Matches(/^[a-z0-9]+$/, {
    message: 'Slug mag alleen kleine letters en cijfers bevatten (geen streepjes)',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
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
}
