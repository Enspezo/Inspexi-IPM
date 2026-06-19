// Doel in apps/api: src/modules/photos/dto/
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID, IsOptional, IsString, IsDateString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PhotoUploadDto {
  @ApiProperty({ enum: ['asset', 'finding', 'inspectionPlan'] })
  @IsIn(['asset', 'finding', 'inspectionPlan'])
  entityType: 'asset' | 'finding' | 'inspectionPlan';

  @ApiProperty() @IsUUID()
  entityId: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  caption?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  capturedAt?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber()
  gpsLatitude?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber()
  gpsLongitude?: number;
}
