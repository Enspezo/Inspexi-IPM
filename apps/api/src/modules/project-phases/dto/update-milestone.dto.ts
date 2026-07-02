import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '@prisma/client';
import { CreateMilestoneDto } from './create-milestone.dto';

/**
 * Alle Create-velden optioneel + de status (OPEN/BEHAALD/VERVALLEN). `completedAt`
 * wordt server-side afgeleid uit de status; `lastReminderStage`/`lastReminderAt`
 * worden server-side gereset bij een `dueDate`-wijziging of terug naar OPEN.
 */
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {
  @ApiPropertyOptional({ enum: MilestoneStatus })
  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;
}
