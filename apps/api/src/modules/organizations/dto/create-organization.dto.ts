import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  Matches,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsEmail,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'InspeXi Demo' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'inspexidemo' })
  @IsString()
  @Matches(/^[a-z0-9]+$/, {
    message: 'Slug mag alleen kleine letters en cijfers bevatten (geen streepjes)',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#1E40AF' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: 21 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultVat?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultValidityDays?: number;

  @ApiPropertyOptional({ example: 'InspeXi Demo' })
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional({ example: 'offerte@mijnbedrijf.nl' })
  @IsOptional()
  @IsEmail()
  senderEmail?: string;

  @ApiPropertyOptional({ example: 8, description: 'Start of working day (0–23)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  workdayStart?: number;

  @ApiPropertyOptional({ example: 17, description: 'End of working day (1–24)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  workdayEnd?: number;
}
