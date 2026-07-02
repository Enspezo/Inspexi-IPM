import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { NotificationType } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';
import {
  NOTIFICATION_MODEL_KEYS,
  type NotificationModel,
} from '../notifications.constants';

export class ListNotificationsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({
    enum: NOTIFICATION_MODEL_KEYS,
    description: 'Filter op model (domein); type heeft voorrang indien beide',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_MODEL_KEYS)
  model?: NotificationModel;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({ description: 'Alleen ongelezen (true/false)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  unread?: boolean;
}
