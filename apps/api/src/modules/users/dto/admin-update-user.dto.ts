import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  IsEmail,
  Matches,
  MaxLength,
  IsNumber,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: 'Hoofdstraat' })
  @IsOptional()
  @IsString()
  homeStreet?: string | null;

  @ApiPropertyOptional({ example: '1A' })
  @IsOptional()
  @IsString()
  homeHouseNumber?: string | null;

  @ApiPropertyOptional({ example: '1234AB' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  homePostalCode?: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam' })
  @IsOptional()
  @IsString()
  homeCity?: string | null;

  @ApiPropertyOptional({ example: 52.3702 })
  @IsOptional()
  @IsNumber()
  homeLat?: number | null;

  @ApiPropertyOptional({ example: 4.8952 })
  @IsOptional()
  @IsNumber()
  homeLng?: number | null;
}
