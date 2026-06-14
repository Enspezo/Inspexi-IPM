import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional } from 'class-validator';

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
}
