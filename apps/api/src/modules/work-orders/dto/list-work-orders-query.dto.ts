import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListWorkOrdersQueryDto extends BasePaginationQueryDto {
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
}
