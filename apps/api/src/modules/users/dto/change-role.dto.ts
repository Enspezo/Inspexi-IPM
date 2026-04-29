import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, ArrayMinSize } from 'class-validator';
import { Role } from '@prisma/client';

export class ChangeRoleDto {
  @ApiProperty({ enum: Role, isArray: true })
  @IsArray()
  @IsEnum(Role, { each: true })
  @ArrayMinSize(1)
  roles: Role[];
}
