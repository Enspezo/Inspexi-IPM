import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

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
}
