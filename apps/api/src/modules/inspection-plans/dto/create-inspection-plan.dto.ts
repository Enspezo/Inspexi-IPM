import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsNumber,
  IsArray,
  ArrayUnique,
} from 'class-validator';

export class CreateInspectionPlanDto {
  @ApiProperty({ description: 'Opdrachtgever (Beheer Contact)' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ description: 'Gekoppeld project (Beheer Project)' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'CRM-hoofdlocatie = boom-wortel. De asset-/locatieboom wordt lazily aangemaakt.',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Deellocaties in scope (LOCATION asset-node-ids; moeten in de boom van locationId zitten)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true, message: 'Ongeldig scope-locatie-id' })
  scopeLocationIds?: string[];

  @ApiPropertyOptional({ description: 'Inspectie-template (org of systeem)' })
  @IsOptional()
  @IsUUID()
  inspectionTemplateId?: string;

  @ApiProperty({ example: 'Keuring hoofdverdeler pand A' })
  @IsString()
  projectName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({
    example: 'NEN1010',
    description: 'Normcode (→ imp_norm_type_definitions.code)',
  })
  @IsString()
  normTypeCode: string;

  @ApiPropertyOptional({
    example: 'initial',
    description: 'Inspectietype-code (→ imp_inspection_types.code)',
  })
  @IsOptional()
  @IsString()
  inspectionTypeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressHouseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressPostalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  gpsLatitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  gpsLongitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Toegewezen inspecteur (User)' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Reviewer (User)' })
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @ApiPropertyOptional({
    description: 'Installatieverantwoordelijke (ContactPerson)',
  })
  @IsOptional()
  @IsUUID()
  installationResponsibleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
