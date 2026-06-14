import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { InspectionExecStatus } from '@prisma/client';

export class UpdateVisualInspectionDto {
  @ApiPropertyOptional({ enum: InspectionExecStatus })
  @IsOptional()
  @IsEnum(InspectionExecStatus)
  status?: InspectionExecStatus;

  @ApiPropertyOptional({ description: 'Checklist-resultaten (array van items)', type: [Object] })
  @IsOptional()
  @IsArray()
  checklistResults?: unknown[];
}
