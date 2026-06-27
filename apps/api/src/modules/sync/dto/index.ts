// v2 sync-contract — entiteit-gegroepeerd, veldnamen ALIGNED op het Beheer-schema
// (statusCode, contactId, orgId, classificationValues, normTypeCode).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsDateString, IsArray, IsIn, IsObject,
  ValidateNested, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SyncRecordData } from '../sync-mapper';

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
  data: SyncRecordData;
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

  // Additief (REQ1 PR2): chat-berichten van de PWA-inspecteur. Verwerkt via
  // ChatService (membership-auth + notificaties), niet via de generieke mutator.
  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  chatMessages?: EntityChangeDto[];

  // Additief: chat-threads (PWA stuurt deze bij het offline aanmaken van een
  // 1-op-1 gesprek). Idempotent geadopteerd op client-UUID via ChatService —
  // moet vóór chatMessages verwerkt worden zodat de thread bestaat.
  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  chatThreads?: EntityChangeDto[];

  // Additief: presence (eigen beschikbaarheidsstatus). De gebruiker komt altijd
  // uit de JWT; de payload bepaalt alleen status + notitie.
  @ApiPropertyOptional({ type: [EntityChangeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EntityChangeDto)
  presence?: EntityChangeDto[];
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
