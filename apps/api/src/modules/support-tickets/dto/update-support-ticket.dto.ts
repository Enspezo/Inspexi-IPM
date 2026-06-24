import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  /** UUID om toe te wijzen, of `null` om de toewijzing te verwijderen. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;
}
