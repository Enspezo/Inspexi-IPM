import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsEmail } from 'class-validator';
import { ContactType } from '@prisma/client';

export class CreateContactDto {
  @ApiProperty({ enum: ContactType, example: ContactType.COMPANY })
  @IsEnum(ContactType)
  type: ContactType;

  @ApiPropertyOptional({ example: 'Bouwbedrijf De Vries BV' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'Jan' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'de Vries' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'info@devries.nl' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+31612345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://devries.nl' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'NL123456789B01' })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  cocNumber?: string;

  @ApiPropertyOptional({ example: 'Vaste klant sinds 2020' })
  @IsOptional()
  @IsString()
  notes?: string;
}
