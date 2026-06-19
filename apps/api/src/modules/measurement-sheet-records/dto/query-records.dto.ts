import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { MeasurementSheetRecordStatus } from '@prisma/client';

export class QueryMeasurementSheetRecordsDto {
  @ApiPropertyOptional({ description: 'Filter op asset' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Filter op inspectieplan' })
  @IsOptional()
  @IsUUID()
  inspectionPlanId?: string;

  @ApiPropertyOptional({ description: 'Filter op template' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ enum: MeasurementSheetRecordStatus, description: 'Filter op status' })
  @IsOptional()
  @IsEnum(MeasurementSheetRecordStatus)
  status?: MeasurementSheetRecordStatus;
}
