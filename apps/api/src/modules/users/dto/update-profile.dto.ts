import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, IsEmail } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jan' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional({ example: 'de Vries' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ example: 'jan@bedrijf.nl' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
