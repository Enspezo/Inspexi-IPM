import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { TaskStatus, TaskType, TaskEntityType } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({ example: 'NEN1010 keuring plannen' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Beschrijving van de taak' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TE_DOEN })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskType, default: TaskType.TO_DO })
  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @ApiProperty({ enum: TaskEntityType })
  @IsEnum(TaskEntityType)
  entityType: TaskEntityType;

  @ApiProperty({ example: 'uuid', description: 'ID van de gekoppelde entiteit' })
  @IsUUID()
  entityId: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Toegewezen aan gebruiker ID' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ example: '2026-03-15', description: 'Deadline datum' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}
