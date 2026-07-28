import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListAuditLogsQueryDto extends BasePaginationQueryDto {
  // Bewust lager dan de basiscap (200): audit-entries zijn zware rijen (JSON-diffs
  // + FK-resolutie) en de AuditHistory-sidebar pagineert per 10.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  override limit?: number = 20;
}
