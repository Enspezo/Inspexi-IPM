import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

class NotificationPrefItemDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty()
  @IsBoolean()
  channelInApp: boolean;

  @ApiProperty()
  @IsBoolean()
  channelEmail: boolean;
}

export class SavePrefsDto {
  @ApiProperty({ type: [NotificationPrefItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPrefItemDto)
  prefs: NotificationPrefItemDto[];
}
