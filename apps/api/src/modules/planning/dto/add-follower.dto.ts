import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsEmail } from 'class-validator';

export class AddFollowerDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'Gebruiker ID (platform gebruiker)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'klant@bedrijf.nl', description: 'E-mailadres (externe volger)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Jan de Vries', description: 'Naam van externe volger' })
  @IsOptional()
  @IsString()
  name?: string;
}
