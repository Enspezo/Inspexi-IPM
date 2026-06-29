import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsArray, ArrayUnique } from 'class-validator';

export class CreateMeasurementSheetRecordDto {
  @ApiProperty({ description: 'Globaal meetstaat-template (snapshot bij aanmaken)' })
  @IsUUID()
  templateId: string;

  @ApiProperty({ description: 'Asset-node waarop de meetstaat wordt ingevuld' })
  @IsUUID()
  assetNodeId: string;

  @ApiProperty({ description: 'Inspectieplan (de asset-node moet in de boom van dit plan zitten)' })
  @IsUUID()
  inspectionPlanId: string;

  @ApiPropertyOptional({ type: [String], description: 'Gebruikte meetmiddelen (instrument-UUIDs)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true, message: 'Ongeldig meetmiddel-id' })
  usedInstrumentIds?: string[];
}
