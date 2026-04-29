import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListAuditLogsQueryDto extends BasePaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  override limit?: number = 20;
}
