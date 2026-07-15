import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, IsDateString, IsEnum, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PlanningStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListPlanningQueryDto extends BasePaginationQueryDto {
  // Kalenderweergave laadt een bereik van ~6 weken in één keer (portal limit=200)
  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

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
