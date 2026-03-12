import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListProductGroupsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override limit?: number = 50;
}
