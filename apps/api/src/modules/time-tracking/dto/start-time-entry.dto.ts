import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { TimeActivityType, TimeEntrySource } from '@prisma/client';

/**
 * Start een nieuwe timer. Een lopende timer van dezelfde gebruiker wordt in
 * dezelfde transactie gestopt (één timer tegelijk, PRD-16 §4.3).
 */
export class StartTimeEntryDto {
  @ApiProperty({ enum: TimeActivityType })
  @IsEnum(TimeActivityType)
  activityType: TimeActivityType;

  @ApiPropertyOptional({ description: 'Verplicht behalve bij OVERIG (en REIS_AUTO, zie PRD-16 §6.2)' })
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

  // CORRECTIE is voorbehouden aan het staf-correctiepad (PATCH), niet aan start.
  @ApiPropertyOptional({
    enum: [
      TimeEntrySource.HANDMATIG,
      TimeEntrySource.AGENDA,
      TimeEntrySource.INSPECTIE_AUTO,
      TimeEntrySource.REIS_AUTO,
    ],
    default: TimeEntrySource.HANDMATIG,
  })
  @IsOptional()
  @IsIn([
    TimeEntrySource.HANDMATIG,
    TimeEntrySource.AGENDA,
    TimeEntrySource.INSPECTIE_AUTO,
    TimeEntrySource.REIS_AUTO,
  ])
  source?: TimeEntrySource;

  @ApiPropertyOptional({
    description:
      'Werkelijke starttijd (bijv. gedetecteerd vertrek iets vóór de API-call); max 12 uur terug, niet in de toekomst',
  })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

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
