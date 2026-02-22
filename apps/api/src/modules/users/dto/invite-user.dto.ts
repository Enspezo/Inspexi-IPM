import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteUserDto {
  @ApiProperty({ example: 'nieuw@bedrijf.nl' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: Role, example: Role.BACKOFFICE })
  @IsEnum(Role)
  role: Role;
}
