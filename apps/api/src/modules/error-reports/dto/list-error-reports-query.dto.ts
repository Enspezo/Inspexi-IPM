import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorReportStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListErrorReportsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ enum: ErrorReportStatus })
  @IsOptional()
  @IsEnum(ErrorReportStatus)
  status?: ErrorReportStatus;
}
