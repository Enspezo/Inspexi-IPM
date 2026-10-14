import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { TimesheetStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class ListTimesheetsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op inspecteur (staf); INSPECTEUR ziet altijd alleen zichzelf' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: TimesheetStatus })
  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  @ApiPropertyOptional({ description: 'ISO-weekjaar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'ISO-weeknummer 1..53' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week?: number;
}
