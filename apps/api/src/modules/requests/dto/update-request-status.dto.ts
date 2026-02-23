import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.IN_BEHANDELING })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({ example: 'Notitie bij statuswijziging' })
  @IsOptional()
  @IsString()
  note?: string;
}
