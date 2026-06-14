import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { MeasurementSheetTemplateStatus } from '@prisma/client';

export class QueryMeasurementSheetTemplatesDto {
  @ApiPropertyOptional({ description: 'Normcode-filter' })
  @IsOptional()
  @IsString()
  normType?: string;

  @ApiPropertyOptional({ description: 'Asset-type-code-filter (array bevat)' })
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiPropertyOptional({ enum: MeasurementSheetTemplateStatus })
  @IsOptional()
  @IsEnum(MeasurementSheetTemplateStatus)
  status?: MeasurementSheetTemplateStatus;
}
