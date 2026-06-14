import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsDateString } from 'class-validator';
import { CreateInspectionPlanDto } from './create-inspection-plan.dto';

/**
 * Bij update zijn alle Create-velden optioneel. In tegenstelling tot de
 * referentie-skelet mag statusCode hier WEL gezet worden — dit is nodig om een
 * plan naar `in_progress` te brengen (mirror van de originele Inspexi-App).
 * Status-validatie loopt via LookupService (`plan-status-types`).
 */
export class UpdateInspectionPlanDto extends PartialType(
  CreateInspectionPlanDto,
) {
  @ApiPropertyOptional({
    description: 'Planstatus-code (→ imp_plan_status_types.code)',
  })
  @IsOptional()
  @IsString()
  statusCode?: string;

  @ApiPropertyOptional({ description: 'Starttijdstip (ISO)' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'Interne notities' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Vrije metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
