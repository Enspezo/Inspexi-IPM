// Doel in apps/api: src/modules/inspection-plans/dto/ (gesplitst per bestand of als index)

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsUUID, IsDateString, IsIn, IsNumber,
} from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class CreateInspectionPlanDto {
  @ApiProperty({ description: 'Opdrachtgever (Beheer Contact)' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ description: 'Gekoppeld project (Beheer Project)' })
  @IsOptional() @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Inspectie-template (org of systeem)' })
  @IsOptional() @IsUUID()
  inspectionTemplateId?: string;

  @ApiProperty({ example: 'Keuring hoofdverdeler pand A' })
  @IsString()
  projectName: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  referenceNumber?: string;

  @ApiProperty({ example: 'NEN1010', description: 'Normcode (→ imp_norm_type_definitions.code)' })
  @IsString()
  normTypeCode: string;

  @ApiPropertyOptional({ example: 'initial', description: 'Inspectietype-code (→ imp_inspection_types.code)' })
  @IsOptional() @IsString()
  inspectionTypeCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() addressStreet?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressHouseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressPostalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressCity?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() gpsLatitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() gpsLongitude?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deadline?: string;

  @ApiPropertyOptional({ description: 'Toegewezen inspecteur (User)' })
  @IsOptional() @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Reviewer (User)' })
  @IsOptional() @IsUUID()
  reviewerId?: string;

  @ApiPropertyOptional({ description: 'Installatieverantwoordelijke (ContactPerson)' })
  @IsOptional() @IsUUID()
  installationResponsibleId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

// Bij update zijn alle velden optioneel; statusCode loopt via /submit en /review, niet hier.
export class UpdateInspectionPlanDto extends PartialType(CreateInspectionPlanDto) {}

export class ListInspectionPlansQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op projectnaam / referentie' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter op status-code' })
  @IsOptional() @IsString()
  statusCode?: string;

  @ApiPropertyOptional({ description: 'Filter op opdrachtgever' })
  @IsOptional() @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Alleen aan mij toegewezen' })
  @IsOptional() @IsString()
  onlyMine?: string;
}

export class ReviewInspectionPlanDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}
