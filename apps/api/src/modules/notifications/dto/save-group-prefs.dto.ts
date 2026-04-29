import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType, Role } from '@prisma/client';

class GroupPrefItemDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

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

export class SaveGroupPrefsDto {
  @ApiProperty({ type: [GroupPrefItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupPrefItemDto)
  prefs: GroupPrefItemDto[];
}
