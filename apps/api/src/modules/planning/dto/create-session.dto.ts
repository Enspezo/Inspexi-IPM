import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsNumber, Min, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({ example: '2026-03-15T09:00:00Z', description: 'Geplande startdatum en -tijd van de sessie' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional({ example: 8, description: 'Duur in uren (bijv. 8 = 8 uur)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @ApiPropertyOptional({ example: 'Dag 1 – intake en voorbereiding', description: 'Notitie voor deze sessie' })
  @IsOptional()
  @IsString()
  notes?: string;
}
