import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { InspectionExecStatus } from '@prisma/client';

export class UpdateMeasurementRecordDto {
  @ApiPropertyOptional({ enum: InspectionExecStatus })
  @IsOptional()
  @IsEnum(InspectionExecStatus)
  status?: InspectionExecStatus;

  @ApiPropertyOptional({ description: 'Metingen (lijst van meetwaarden)', type: [Object] })
  @IsOptional()
  @IsArray()
  measurements?: unknown[];

  @ApiPropertyOptional({ example: 'Megger MIT430' })
  @IsOptional()
  @IsString()
  instrumentType?: string;

  @ApiPropertyOptional({ example: 'SN-123456' })
  @IsOptional()
  @IsString()
  instrumentSerial?: string;

  @ApiPropertyOptional({ description: 'Kalibratiedatum (ISO-datum)', example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  calibrationDate?: string;
}
