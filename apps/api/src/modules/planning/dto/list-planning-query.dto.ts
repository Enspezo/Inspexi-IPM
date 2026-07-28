import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsDateString, IsEnum, IsString } from 'class-validator';
import { PlanningStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListPlanningQueryDto extends BasePaginationQueryDto {
  // `limit` volgt de basiscap (200) — de vroegere @Max(200)-override is daarmee
  // vervallen; de kalenderweergave (~6 weken in één request) past er nog steeds in.

  @ApiPropertyOptional({ example: 'NEN1010' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PlanningStatus })
  @IsOptional()
  @IsEnum(PlanningStatus)
  status?: PlanningStatus;

  @ApiPropertyOptional({ example: 'uuid', description: 'Filter op inspecteur' })
  @IsOptional()
  @IsUUID()
  inspectorId?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Filter op contact' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ example: '2026-03-01', description: 'Vanaf datum (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Tot datum (ISO)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 'false', description: 'Geannuleerde items meenemen' })
  @IsOptional()
  @IsString()
  showCancelled?: string;
}
