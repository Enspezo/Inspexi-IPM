import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TimeActivityType, TimesheetStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class ListTimeEntriesQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op inspecteur (staf); INSPECTEUR ziet altijd alleen zichzelf' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: TimeActivityType })
  @IsOptional()
  @IsEnum(TimeActivityType)
  activityType?: TimeActivityType;

  @ApiPropertyOptional({ description: 'Ondergrens startedAt (inclusief)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Bovengrens startedAt (exclusief)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  timesheetId?: string;

  @ApiPropertyOptional({ enum: TimesheetStatus, description: 'Filter op weekstaat-status (bijv. GOEDGEKEURD voor export)' })
  @IsOptional()
  @IsEnum(TimesheetStatus)
  timesheetStatus?: TimesheetStatus;
}
