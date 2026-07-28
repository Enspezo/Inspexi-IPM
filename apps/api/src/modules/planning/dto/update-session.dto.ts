import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsNumber, Min, IsString, IsBoolean } from 'class-validator';

export class UpdateSessionDto {
  @ApiPropertyOptional({ example: '2026-03-15T09:00:00Z', description: 'Nieuwe datum en tijd van de sessie (null = verwijder datum)' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string | null;

  @ApiPropertyOptional({ example: 8, description: 'Duur in uren' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number | null;

  @ApiPropertyOptional({ example: 'Dag 2 – inspectie gebouw A', description: 'Sessienotitie' })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Negeer beschikbaarheidswaarschuwingen bij het verzetten van de sessie (PRD-12 §12.9)' })
  @IsOptional()
  @IsBoolean()
  overrideAvailabilityWarnings?: boolean;
}
