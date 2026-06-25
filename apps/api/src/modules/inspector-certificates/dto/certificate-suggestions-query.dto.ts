import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Autocomplete-bron voor "Soort" en "Instantie" (distinct waarden binnen de org). */
export class CertificateSuggestionsQueryDto {
  @ApiProperty({ enum: ['type', 'issuer'], description: 'Veld waarvoor suggesties gevraagd worden' })
  @IsIn(['type', 'issuer'], { message: 'Ongeldig veld' })
  field: 'type' | 'issuer';

  @ApiPropertyOptional({ description: 'Zoekterm voor de suggesties' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
