import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class SubmitInspectionPlanDto {
  @ApiPropertyOptional({ description: 'Reviewer (User) — overschrijft plan-reviewer' })
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @ApiPropertyOptional({ description: 'Notities bij indienen' })
  @IsOptional()
  @IsString()
  notes?: string;
}
