import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

/**
 * Eén tijdslot binnen een template-weekdag. Minuten vanaf middernacht.
 * Grenzen (0 ≤ start < eind ≤ 1440) en overlap-vrijheid per weekdag worden
 * aanvullend in de service gevalideerd (kruis-slot-controle).
 */
export class AvailabilityTemplateSlotDto {
  @ApiProperty({ example: 1, description: 'ISO-8601 weekdag: 1 = maandag ... 7 = zondag' })
  @IsInt()
  @Min(1, { message: 'Weekdag moet tussen 1 (maandag) en 7 (zondag) liggen' })
  @Max(7, { message: 'Weekdag moet tussen 1 (maandag) en 7 (zondag) liggen' })
  weekday!: number;

  @ApiProperty({ example: 480, description: 'Starttijd in minuten vanaf middernacht (480 = 08:00)' })
  @IsInt()
  @Min(0, { message: 'Starttijd moet tussen 0 en 1440 minuten liggen' })
  @Max(1440, { message: 'Starttijd moet tussen 0 en 1440 minuten liggen' })
  startMinute!: number;

  @ApiProperty({ example: 1050, description: 'Eindtijd in minuten vanaf middernacht (1050 = 17:30)' })
  @IsInt()
  @Min(0, { message: 'Eindtijd moet tussen 0 en 1440 minuten liggen' })
  @Max(1440, { message: 'Eindtijd moet tussen 0 en 1440 minuten liggen' })
  endMinute!: number;
}
