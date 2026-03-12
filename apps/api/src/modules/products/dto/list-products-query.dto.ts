import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListProductsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter op productgroep (UUID)' })
  @IsOptional()
  @IsUUID()
  productGroupId?: string;

  @ApiPropertyOptional({ description: 'Filter op actief (true/false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;
}
