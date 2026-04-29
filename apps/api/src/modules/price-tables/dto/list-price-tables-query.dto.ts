import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListPriceTablesQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam' })
  @IsOptional()
  @IsString()
  search?: string;
}
