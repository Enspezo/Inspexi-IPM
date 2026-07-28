import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhaseStatus } from '@prisma/client';

export class CreateProjectPhaseDto {
  @ApiProperty({ example: 'Fase 1 — Kantoorpand Zuidas' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: PhaseStatus })
  @IsOptional()
  @IsEnum(PhaseStatus)
  status?: PhaseStatus;

  @ApiPropertyOptional({ description: 'CRM-locatie voor deze fase' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Contactpersoon van het projectcontact' })
  @IsOptional()
  @IsUUID()
  contactPersonId?: string;

  @ApiPropertyOptional({ description: 'Startdatum (ISO)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Verwachte einddatum (ISO)' })
  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;

  @ApiPropertyOptional({ description: 'Budget (haak voor deelfacturatie, PRD-08)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetAmount?: number;
}
