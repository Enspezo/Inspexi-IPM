import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, MinLength } from 'class-validator';

export class CreateRescheduleRequestDto {
  @ApiProperty({ example: 'Ik ben niet beschikbaar op de geplande datum' })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiProperty({ example: '2026-04-01', description: 'Gewenste nieuwe datum (ISO)' })
  @IsDateString()
  preferredDate: string;

  @ApiPropertyOptional({ example: 'Jan de Vries' })
  @IsOptional()
  @IsString()
  clientName?: string;
}
