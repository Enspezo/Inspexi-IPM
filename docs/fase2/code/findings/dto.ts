// Doel in apps/api: src/modules/findings/dto/

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsEnum, IsObject } from 'class-validator';
import { FindingInspectionType } from '@prisma/client';

export class CreateFindingDto {
  @ApiProperty({ enum: FindingInspectionType })
  @IsEnum(FindingInspectionType) inspectionType: FindingInspectionType;

  @ApiPropertyOptional() @IsOptional() @IsUUID() visualInspectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() measurementRecordId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() findingTemplateId?: string;

  @ApiProperty({ example: 'Onvoldoende beschermingsleiding' })
  @IsString() shortDescription: string;

  @ApiPropertyOptional() @IsOptional() @IsString() longDescription?: string;

  @ApiPropertyOptional({ description: 'Classificatiewaarden, bv. { "RISICO": "HOOG" }' })
  @IsOptional() @IsObject() classificationValues?: Record<string, string>;

  @ApiPropertyOptional() @IsOptional() @IsString() locationDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendationCustom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() normReference?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() checklistItemId?: string;
}

export class UpdateFindingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shortDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() longDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() classificationValues?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsString() locationDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendationCustom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() normReference?: string;
  @ApiPropertyOptional({ description: 'Status-code (→ imp_finding_status_types.code)' })
  @IsOptional() @IsString() statusCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resolutionNotes?: string;
}
