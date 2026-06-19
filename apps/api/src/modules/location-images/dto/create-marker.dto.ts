import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MarkerType } from '@prisma/client';

export class CreateMarkerDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Horizontale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionX: number;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'Verticale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionY: number;

  @ApiProperty({ enum: MarkerType })
  @IsEnum(MarkerType)
  markerType: MarkerType;

  @ApiPropertyOptional({ description: 'Asset-FK (alleen bij markerType ASSET)' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Constatering-FK (alleen bij markerType FINDING)' })
  @IsOptional()
  @IsUUID()
  findingId?: string;

  @ApiPropertyOptional({ description: 'Meting-FK (alleen bij markerType MEASUREMENT)' })
  @IsOptional()
  @IsUUID()
  standaloneMeasurementId?: string;

  @ApiPropertyOptional({ description: 'Vrije annotatie (JSON)' })
  @IsOptional()
  @IsObject()
  annotation?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;
}
