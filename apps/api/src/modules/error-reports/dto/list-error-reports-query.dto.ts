import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorReportStatus } from '@prisma/client';

export class ListErrorReportsQueryDto {
  @ApiPropertyOptional({ enum: ErrorReportStatus })
  @IsOptional()
  @IsEnum(ErrorReportStatus)
  status?: ErrorReportStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
