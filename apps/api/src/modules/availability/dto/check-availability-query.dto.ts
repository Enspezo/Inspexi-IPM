import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsDateString } from 'class-validator';

/** Controleer of een inspecteur beschikbaar is tussen `start` en `end`. */
export class CheckAvailabilityQueryDto {
  @ApiProperty({ description: 'Inspecteur' })
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  userId!: string;

  @ApiProperty({ example: '2026-07-20T08:00:00.000Z' })
  @IsDateString({}, { message: 'Ongeldige starttijd' })
  start!: string;

  @ApiProperty({ example: '2026-07-20T12:00:00.000Z' })
  @IsDateString({}, { message: 'Ongeldige eindtijd' })
  end!: string;
}
