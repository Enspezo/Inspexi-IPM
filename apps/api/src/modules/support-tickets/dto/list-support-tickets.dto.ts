import { IsIn, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SupportTicketStatus } from '@prisma/client';

export class ListSupportTicketsDto {
  /** mine = eigen tickets; org = alle org-tickets (alleen management/superuser). */
  @IsOptional()
  @IsIn(['mine', 'org'])
  scope?: 'mine' | 'org';

  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
