import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

export class UpdateWorkOrderStatusDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  status: WorkOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
