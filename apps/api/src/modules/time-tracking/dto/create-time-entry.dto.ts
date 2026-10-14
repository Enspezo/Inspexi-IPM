import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TimeActivityType } from '@prisma/client';

/** Handmatige (afgeronde) urenregel — bijv. achteraf toegevoegd in de weekstaat. */
export class CreateTimeEntryDto {
  @ApiProperty({ enum: TimeActivityType })
  @IsEnum(TimeActivityType)
  activityType: TimeActivityType;

  @ApiPropertyOptional({ description: 'Verplicht behalve bij OVERIG' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  inspectionPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planningItemId?: string;

  @ApiProperty()
  @IsDateString()
  startedAt: string;

  @ApiProperty()
  @IsDateString()
  endedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'PWA offline-id voor idempotente sync' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientId?: string;
}
