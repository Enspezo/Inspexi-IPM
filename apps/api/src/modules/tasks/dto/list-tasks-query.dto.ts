import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsBooleanString, IsUUID, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus, TaskType, TaskEntityType } from '@prisma/client';

export class ListTasksQueryDto {
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

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Sorteerveld' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}