import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListCustomerGroupsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam' })
  @IsOptional()
  @IsString()
  search?: string;

  // Override alléén voor de default van 50; de cap volgt de basiscap (200).
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  override limit?: number = 50;
}
