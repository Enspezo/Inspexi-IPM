import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateContactAddressDto {
  @ApiProperty({ example: 'Factuuradres' })
  @IsString()
  label: string;

  @ApiProperty({ example: 'Industrieweg' })
  @IsString()
  street: string;

  @ApiProperty({ example: '42' })
  @IsString()
  houseNumber: string;

  @ApiProperty({ example: '1234 AB' })
  @IsString()
  postalCode: string;

  @ApiProperty({ example: 'Amsterdam' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'NL', default: 'NL' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: false, default: false, description: 'Postadres' })
  @IsOptional()
  @IsBoolean()
  isPostal?: boolean;

  @ApiPropertyOptional({ example: false, default: false, description: 'Factuuradres' })
  @IsOptional()
  @IsBoolean()
  isInvoice?: boolean;

  @ApiPropertyOptional({ description: 'Eigen velden (key-value JSON)' })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
