import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsNumber, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'ID van het gekoppelde locatietype (LocationTypeDefinition)' })
  @IsOptional()
  @IsUUID()
  locationTypeId?: string;

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

  @ApiPropertyOptional({ example: 52.3676, description: 'Breedtegraad (WGS84)' })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 4.9041, description: 'Lengtegraad (WGS84)' })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ description: 'Eigen velden (key-value JSON)' })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
