import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RequestStatus } from '@prisma/client';

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.IN_BEHANDELING })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({ example: 'Notitie bij statuswijziging' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'ID van de reden verloren (lookup)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  lostReasonId?: string;

  @ApiPropertyOptional({ example: 'Klant koos voor een goedkopere aanbieder' })
  @IsOptional()
  @IsString()
  lostNote?: string;
}
