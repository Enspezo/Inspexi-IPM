import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsDateString } from 'class-validator';

/** Filter voor het opvragen van uitzonderingen (PRD §12.6). */
export class ListAvailabilityExceptionsQueryDto {
  @ApiPropertyOptional({ description: 'Inspecteur; leeg = eigen uitzonderingen' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  userId?: string;

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Vanaf (date-only)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige begindatum' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 't/m (date-only)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ongeldige einddatum' })
  to?: string;
}
