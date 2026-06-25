import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Autocomplete-suggesties voor merk/type (meetmiddel) of uitvoerende instantie (kalibratie). */
export class InstrumentSuggestionsQueryDto {
  @ApiProperty({ enum: ['brand', 'type', 'performedBy'] })
  @IsIn(['brand', 'type', 'performedBy'], { message: 'Ongeldig veld' })
  field: 'brand' | 'type' | 'performedBy';

  @ApiPropertyOptional({ description: 'Optionele zoekterm' })
  @IsOptional()
  @IsString()
  q?: string;
}
