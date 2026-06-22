import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ChatThreadType, Role } from '@prisma/client';

export class CreateThreadDto {
  @ApiProperty({ enum: ChatThreadType })
  @IsEnum(ChatThreadType)
  type: ChatThreadType;

  @ApiPropertyOptional({ description: 'De andere gebruiker (vereist bij DIRECT)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: Role, description: 'Team-rol (vereist bij TEAM)' })
  @IsOptional()
  @IsEnum(Role)
  teamRole?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ description: 'Modelnaam (PascalCase) van het gekoppelde record, bv. "Request"' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceEntityType?: string;

  @ApiPropertyOptional({ description: 'ID van het gekoppelde record' })
  @IsOptional()
  @IsUUID()
  referenceEntityId?: string;
}
