import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Vrijwillig goedkeuringsverzoek aan het eigen team (rol). De rol is optioneel:
 * heeft de aanvrager precies één staf-rol, dan wordt die automatisch gebruikt;
 * bij meerdere rollen moet er expliciet één gekozen worden (en die moet bij de
 * aanvrager horen). (REQ5)
 */
export class RequestTeamApprovalDto {
  @ApiPropertyOptional({ enum: Role, description: 'Team/rol om goedkeuring aan te vragen' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Optionele notitie bij het verzoek' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Vrijwillig goedkeuringsverzoek aan een specifieke persoon. (REQ5) */
export class RequestPersonApprovalDto {
  @ApiProperty({ description: 'Gebruiker-ID van de gevraagde goedkeurder' })
  @IsUUID()
  approverUserId: string;

  @ApiPropertyOptional({ description: 'Optionele notitie bij het verzoek' })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Beoordeling (goedkeuren/afwijzen) van een specifiek vrijwillig verzoek. (REQ5) */
export class ReviewVoluntaryApprovalDto {
  @ApiPropertyOptional({ description: 'Optionele notitie bij de beoordeling' })
  @IsOptional()
  @IsString()
  note?: string;
}
