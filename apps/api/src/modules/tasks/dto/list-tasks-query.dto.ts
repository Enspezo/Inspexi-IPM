import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBooleanString, IsUUID } from 'class-validator';
import { TaskStatus, TaskType, TaskEntityType } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListTasksQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op titel' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskType })
  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @ApiPropertyOptional({ enum: TaskEntityType })
  @IsOptional()
  @IsEnum(TaskEntityType)
  entityType?: TaskEntityType;

  @ApiPropertyOptional({ description: 'Filter op specifieke entiteit ID' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Alleen mijn taken tonen' })
  @IsOptional()
  @IsBooleanString()
  onlyMine?: string;
}
