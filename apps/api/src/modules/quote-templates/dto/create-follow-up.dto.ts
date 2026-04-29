import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  IsString,
  IsBoolean,
  Min,
  ValidateIf,
} from 'class-validator';
import { FollowUpType, FollowUpAssigneeType } from '@prisma/client';

export class CreateFollowUpDto {
  @ApiProperty({ enum: FollowUpType })
  @IsEnum(FollowUpType)
  type: FollowUpType;

  @ApiProperty({ example: 3, description: 'Dagen na versturen offerte' })
  @IsInt()
  @Min(1)
  delayDays: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'E-mailsjabloon ID (alleen voor type EMAIL)',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsUUID('4')
  emailTemplateId?: string | null;

  @ApiPropertyOptional({
    description: 'Standaard notitie (voor TELEFOONGESPREK)',
  })
  @IsOptional()
  @IsString()
  defaultNotes?: string;

  @ApiPropertyOptional({
    enum: FollowUpAssigneeType,
    default: FollowUpAssigneeType.QUOTE_OWNER,
  })
  @IsOptional()
  @IsEnum(FollowUpAssigneeType)
  assigneeType?: FollowUpAssigneeType;

  @ApiPropertyOptional({
    description: 'Specifiek gebruiker ID (alleen bij SPECIFIC_USER)',
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsUUID('4')
  assigneeUserId?: string | null;
}
