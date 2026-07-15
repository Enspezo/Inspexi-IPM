import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsDateString, IsNumber, Min, IsArray, IsBoolean, IsInt, Max, ValidateIf } from 'class-validator';

export class UpdatePlanningItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Projectfase ID (null om te ontkoppelen). Moet bij hetzelfde project horen (PRD-12).', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  projectPhaseId?: string | null;

  @ApiPropertyOptional({ description: 'Contactpersoon ID (optioneel, null om te wissen)' })
  @IsOptional()
  @IsUUID()
  contactPersonId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({ description: 'Meerdaagse planning (meerdere sessies)' })
  @IsOptional()
  @IsBoolean()
  isMultiDay?: boolean;

  @ApiPropertyOptional({ description: 'Aantal sessies (min. 2, max. 30)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  sessionCount?: number;

  @ApiPropertyOptional({ description: 'Negeer beschikbaarheidswaarschuwingen bij het verzetten (PRD-12 §12.9)' })
  @IsOptional()
  @IsBoolean()
  overrideAvailabilityWarnings?: boolean;
}
