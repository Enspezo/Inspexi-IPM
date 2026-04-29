import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsEmail } from 'class-validator';
import { ContactPersonRole } from '@prisma/client';

export class CreateContactPersonDto {
  @ApiProperty({ example: 'Jan' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'de Vries' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'jan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+31 6 12345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ContactPersonRole, example: ContactPersonRole.ALGEMEEN })
  @IsEnum(ContactPersonRole)
  role: ContactPersonRole;

  @ApiPropertyOptional({ example: 'Hoofdcontact voor inspecties' })
  @IsOptional()
  @IsString()
  notes?: string;
}
