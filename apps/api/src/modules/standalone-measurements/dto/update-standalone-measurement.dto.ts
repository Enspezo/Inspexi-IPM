import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateStandaloneMeasurementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  measurementType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
