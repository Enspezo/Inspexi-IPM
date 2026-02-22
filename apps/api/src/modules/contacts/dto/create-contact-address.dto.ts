import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

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
}
