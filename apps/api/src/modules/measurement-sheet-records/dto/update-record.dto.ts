import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsObject, IsOptional, IsUUID } from 'class-validator';

export class UpdateMeasurementSheetRecordDto {
  @ApiProperty({
    description:
      'Ingevulde waarden: { sectionCode: { rowIndex: { fieldCode: { value, passFail? } } } }',
  })
  @IsObject()
  data: Record<
    string,
    Record<string, Record<string, { value: unknown; passFail?: string | null }>>
  >;

  @ApiPropertyOptional({ type: [String], description: 'Gebruikte meetmiddelen (instrument-UUIDs)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true, message: 'Ongeldig meetmiddel-id' })
  usedInstrumentIds?: string[];
}
