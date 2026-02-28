import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

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

  @ApiPropertyOptional({
    description: 'Volledige PDOK-locatiedata (JSON) — inclusief BAG-IDs, gemeente, provincie, wijk, buurt, coördinaten',
  })
  @IsOptional()
  @IsObject()
  pdokData?: Record<string, unknown>;
}
