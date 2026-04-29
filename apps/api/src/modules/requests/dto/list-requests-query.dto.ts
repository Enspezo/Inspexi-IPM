import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { RequestStatus, Priority } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListRequestsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op titel of relatie naam' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RequestStatus, description: 'Filter op status' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ enum: Priority, description: 'Filter op prioriteit' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Filter op toegewezen gebruiker' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  override limit?: number = 20;
}
