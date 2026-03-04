import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkOrderStatus } from '@prisma/client';

export class ListWorkOrdersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planningItemId?: string;

  @ApiPropertyOptional({ description: 'Filter by inspector user ID (via planning item)' })
  @IsOptional()
  @IsUUID()
  inspectorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
