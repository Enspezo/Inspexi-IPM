// Doel in apps/api: src/modules/sync/dto/
//
// v2 sync-contract — entiteit-gegroepeerd, veldnamen ALIGNED op het Beheer-schema
// (statusCode, contactId, orgId, classificationValues, normTypeCode).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsDateString, IsArray, IsIn, IsObject,
  ValidateNested, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PullQueryDto {
  @ApiPropertyOptional({ description: 'ISO-tijdstip; alleen wijzigingen ná dit moment' })
  @IsOptional() @IsDateString()
  since?: string;
}

export class EntityChangeDto {
  @ApiProperty({ enum: ['create', 'update', 'delete'] })
  @IsIn(['create', 'update', 'delete'])
  operation: 'create' | 'update' | 'delete';

  @ApiProperty({ description: 'Volledig record (Beheer-veldnamen); id = client-UUID' })
  @IsObject()
  data: Record<string, unknown>;
}

export class PushChangesGroupDto {
  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  inspectionPlans?: EntityChangeDto[];

  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  assets?: EntityChangeDto[];

  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  findings?: EntityChangeDto[];
}

export class PushDto {
  @ApiProperty() @IsString()
  deviceId: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  clientTime?: string;

  @ApiProperty({ type: PushChangesGroupDto })
  @ValidateNested() @Type(() => PushChangesGroupDto)
  changes: PushChangesGroupDto;
}

export class ResolutionDto {
  @ApiProperty({ description: "Singular entiteit, bv. 'inspectionPlan' | 'asset' | 'finding'" })
  @IsString() entityType: string;

  @ApiProperty() @IsUUID()
  entityId: string;

  @ApiProperty({ enum: ['client', 'server', 'merge'] })
  @IsIn(['client', 'server', 'merge'])
  resolution: 'client' | 'server' | 'merge';

  @ApiPropertyOptional() @IsOptional() @IsObject()
  mergedData?: Record<string, unknown>;
}

export class ResolveDto {
  @ApiProperty() @IsString()
  deviceId: string;

  @ApiProperty({ type: [ResolutionDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResolutionDto)
  resolutions: ResolutionDto[];
}
