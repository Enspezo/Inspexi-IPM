import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'ID van de rol (lookup). Leeg = standaardrol "Algemeen".',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ example: 'Hoofdcontact voor inspecties' })
  @IsOptional()
  @IsString()
  notes?: string;
}
