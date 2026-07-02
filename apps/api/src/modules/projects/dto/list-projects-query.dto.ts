import { IsOptional, IsString, IsUUID, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProjectStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListProjectsQueryDto extends BasePaginationQueryDto {
  // De kanban-weergave haalt alle projecten in één keer op (useAllProjects → limit 500);
  // verhoog daarom de basiscap van 100.
  @ApiPropertyOptional({ default: 20, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;
}
