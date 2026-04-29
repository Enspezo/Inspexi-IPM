import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PlanningStatus } from '@prisma/client';

export class UpdatePlanningStatusDto {
  @ApiProperty({ enum: PlanningStatus, description: 'Nieuwe status' })
  @IsEnum(PlanningStatus)
  status: PlanningStatus;

  @ApiPropertyOptional({ example: 'Goedgekeurd door klant', description: 'Optionele toelichting' })
  @IsOptional()
  @IsString()
  note?: string;
}
