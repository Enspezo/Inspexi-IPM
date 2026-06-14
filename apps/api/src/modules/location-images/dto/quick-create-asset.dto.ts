import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class QuickCreateAssetDto {
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

  @ApiProperty({ example: 'verdeler', description: 'Asset-type code' })
  @IsString()
  assetType: string;

  @ApiProperty({ example: 'Hoofdverdeler' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({ description: 'Ouder-asset (null = root)' })
  @IsOptional()
  @IsUUID()
  parentAssetId?: string;

  @ApiPropertyOptional({ description: 'Dynamische velden (asset-type fields)' })
  @IsOptional()
  @IsObject()
  technicalData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Label op de marker' })
  @IsOptional()
  @IsString()
  label?: string;
}
