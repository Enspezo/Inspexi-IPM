import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class ReinspectionRequestDto {
  @ApiProperty({ description: 'Inspectie waarvoor herinspectie wordt aangevraagd' })
  @IsUUID()
  inspectionPlanId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;
}

// org komt uit @CurrentTenant, NOOIT uit de body — daarom geen organizationId-veld.
export class NewAssignmentRequestDto {
  @ApiProperty({ description: 'Contact (opdrachtgever) waarvoor de opdracht geldt' })
  @IsUUID()
  contactId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;
}
