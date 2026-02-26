import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, IsEmail, Matches, MaxLength } from 'class-validator';

export class AdminUpdateUserDto {
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

  @ApiPropertyOptional({ example: 'JDV', description: 'Initialen (max 4 letters A-Z)' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  @Matches(/^[A-Z]+$/, { message: 'Initialen mogen alleen hoofdletters bevatten (A-Z)' })
  initials?: string;
}
