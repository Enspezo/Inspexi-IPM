import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsDateString, IsEnum, IsNumberString, IsString, IsIn } from 'class-validator';
import { PlanningStatus } from '@prisma/client';

export class ListPlanningQueryDto {
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

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ example: '25' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Sorteerveld' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}