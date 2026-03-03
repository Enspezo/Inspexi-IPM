import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorReportStatus } from '@prisma/client';

export class UpdateErrorReportStatusDto {
  @ApiProperty({ enum: ErrorReportStatus })
  @IsEnum(ErrorReportStatus)
  @IsNotEmpty()
  status: ErrorReportStatus;
}
