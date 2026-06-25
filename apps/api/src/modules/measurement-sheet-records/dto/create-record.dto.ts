import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsArray, ArrayUnique } from 'class-validator';

export class CreateMeasurementSheetRecordDto {
  @ApiProperty({ description: 'Globaal meetstaat-template (snapshot bij aanmaken)' })
  @IsUUID()
  templateId: string;

  @ApiProperty({ description: 'Asset waarop de meetstaat wordt ingevuld' })
  @IsUUID()
  assetId: string;

  @ApiPropertyOptional({ description: 'Optioneel inspectieplan (moet bij de asset horen)' })
  @IsOptional()
  @IsUUID()
  inspectionPlanId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Gebruikte meetmiddelen (instrument-UUIDs)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true, message: 'Ongeldig meetmiddel-id' })
  usedInstrumentIds?: string[];
}
