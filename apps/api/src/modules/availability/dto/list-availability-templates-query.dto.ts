import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListAvailabilityTemplatesQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Vrije-tekst zoekopdracht op naam' })
  @IsOptional()
  @IsString()
  search?: string;
}
