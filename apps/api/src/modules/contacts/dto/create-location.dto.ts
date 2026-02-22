import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Hoofdkantoor Amsterdam' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Keizersgracht' })
  @IsString()
  street: string;

  @ApiProperty({ example: '100' })
  @IsString()
  houseNumber: string;

  @ApiProperty({ example: '1015 AA' })
  @IsString()
  postalCode: string;

  @ApiProperty({ example: 'Amsterdam' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'kantoor' })
  @IsOptional()
  @IsString()
  objectType?: string;

  @ApiPropertyOptional({ example: 'Toegang via achterdeur' })
  @IsOptional()
  @IsString()
  notes?: string;
}
