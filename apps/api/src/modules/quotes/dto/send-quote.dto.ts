import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  MinLength,
} from 'class-validator';

export class SendQuoteDto {
  @ApiProperty({ description: 'Ontvanger e-mailadres', example: 'klant@bedrijf.nl' })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({ description: 'CC e-mailadressen', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiProperty({ description: 'E-mailonderwerp' })
  @IsString()
  @MinLength(1)
  subject: string;

  @ApiProperty({ description: 'Persoonlijke begeleidende tekst' })
  @IsString()
  @MinLength(1)
  bodyText: string;
}
