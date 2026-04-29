import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus, LostReason } from '@prisma/client';

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.IN_BEHANDELING })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({ example: 'Notitie bij statuswijziging' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: LostReason, example: LostReason.TE_DUUR })
  @IsOptional()
  @IsEnum(LostReason)
  lostReason?: LostReason;

  @ApiPropertyOptional({ example: 'Klant koos voor een goedkopere aanbieder' })
  @IsOptional()
  @IsString()
  lostNote?: string;
}
