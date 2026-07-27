import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ResolveFindingDto {
  @ApiPropertyOptional({ description: 'Toelichting bij de oplossing (max 4000 tekens)' })
  @IsOptional()
  @IsString()
  // B-407 (WP-C2): Text-kolom zonder DB-limiet — zelfde grens als RepairResolveDto.
  @MaxLength(4000, { message: 'Toelichting mag maximaal 4000 tekens bevatten' })
  description?: string;
}
