// Doel in apps/api: src/modules/assets/dto/

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsUUID, IsOptional, IsInt, IsObject, IsArray,
} from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class CreateAssetDto {
  @ApiPropertyOptional({ description: 'Ouder-asset (null = root)' })
  @IsOptional() @IsUUID() parentAssetId?: string;

  @ApiProperty({ example: 'verdeler', description: 'Asset-type code' })
  @IsString() assetType: string;

  @ApiProperty({ example: 'Hoofdverdeler' })
  @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() identifier?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Dynamische velden (asset-type fields)' })
  @IsOptional() @IsObject() technicalData?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() identifier?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() locationDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Status-code (→ imp_asset_status_types.code)' })
  @IsOptional() @IsString() statusCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() technicalData?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class MoveAssetDto {
  @ApiPropertyOptional({ description: 'Nieuwe ouder (null = root)' })
  @IsOptional() @IsUUID() newParentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class ReorderAssetsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiProperty({ type: [String] })
  @IsArray() @IsUUID('4', { each: true }) assetIds: string[];
}

export class ListAssetsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op opdrachtgever (Contact)' })
  @IsOptional() @IsUUID() contactId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assetTypeCode?: string;
  @ApiPropertyOptional({ description: 'Filter op status-code' })
  @IsOptional() @IsString() statusCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
