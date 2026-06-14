import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsInt, IsObject } from 'class-validator';

export class CreateAssetDto {
  @ApiPropertyOptional({ description: 'Ouder-asset (null = root)' })
  @IsOptional()
  @IsUUID()
  parentAssetId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Dynamische velden (asset-type fields)' })
  @IsOptional()
  @IsObject()
  technicalData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
