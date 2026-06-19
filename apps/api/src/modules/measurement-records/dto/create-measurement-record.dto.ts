import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMeasurementRecordDto {
  @ApiPropertyOptional({
    description: 'Metingen (lijst van meetwaarden), bv. [{ "label": "Riso", "value": 1.2 }]',
    type: [Object],
  })
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

  @ApiPropertyOptional({ description: 'Inspecteur (User-UUID) binnen dezelfde organisatie' })
  @IsOptional()
  @IsUUID()
  inspectorId?: string;
}
