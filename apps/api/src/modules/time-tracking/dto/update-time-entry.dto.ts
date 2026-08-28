import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TimeActivityType } from '@prisma/client';

/**
 * Urenregel bijwerken/corrigeren. `projectId: null` expliciet meesturen is
 * alleen toegestaan in combinatie met activiteit OVERIG (service-validatie).
 */
export class UpdateTimeEntryDto {
  @ApiPropertyOptional({ enum: TimeActivityType })
  @IsOptional()
  @IsEnum(TimeActivityType)
  activityType?: TimeActivityType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  inspectionPlanId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  planningItemId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
