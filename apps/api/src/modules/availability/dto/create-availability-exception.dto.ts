import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsString,
  IsDateString,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { AvailabilityExceptionType } from '@prisma/client';

/**
 * Maak een beschikbaarheids-uitzondering. Eenmalig (`startsAt`/`endsAt`) XOR
 * herhalend (`isRecurring` + weekdagen/tijden); de kruisveld-regels uit PRD
 * §12.4 worden in de service afgedwongen (`validateExceptionInput`).
 */
export class CreateAvailabilityExceptionDto {
  @ApiProperty({ description: 'Inspecteur voor wie de uitzondering geldt' })
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  userId!: string;

  @ApiProperty({ enum: AvailabilityExceptionType })
  @IsEnum(AvailabilityExceptionType, { message: 'Ongeldig type uitzondering' })
  type!: AvailabilityExceptionType;

  @ApiPropertyOptional({ default: false, description: 'true = herhalend (FREQ=WEEKLY)' })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  // ─── Eenmalig ───────────────────────────────────────────
  @ApiPropertyOptional({ example: '2026-08-03T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige begintijd' })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-08-15T00:00:00.000Z', description: 'Exclusief einde' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige eindtijd' })
  endsAt?: string;

  @ApiPropertyOptional({ default: false, description: 'Hele dag (negeert de tijden)' })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  // ─── Herhalend ──────────────────────────────────────────
  @ApiPropertyOptional({ type: [Number], example: [1, 3], description: 'ISO-weekdagen 1..7' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true, message: 'Weekdag moet tussen 1 en 7 liggen' })
  @Max(7, { each: true, message: 'Weekdag moet tussen 1 en 7 liggen' })
  weekdays?: number[];

  @ApiPropertyOptional({ example: 60, description: 'Starttijd in minuten vanaf middernacht' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute?: number;

  @ApiPropertyOptional({ example: 300, description: 'Eindtijd in minuten vanaf middernacht' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute?: number;

  @ApiPropertyOptional({ default: 1, description: '1 = wekelijks, 2 = tweewekelijks' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Het herhaalinterval moet minimaal 1 week zijn' })
  intervalWeeks?: number;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Vanaf (date-only)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige begindatum' })
  recurStartDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 't/m (date-only), null = oneindig' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige einddatum' })
  recurEndDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
