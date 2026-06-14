import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsInt, IsObject } from 'class-validator';

export class CreateLocationDto {
  @ApiPropertyOptional({ description: 'Ouder-locatie (null = root)' })
  @IsOptional()
  @IsUUID()
  parentLocationId?: string;

  @ApiProperty({ example: 'gebouw', description: 'Locatie-type code' })
  @IsString()
  locationType: string;

  @ApiProperty({ example: 'Hoofdgebouw' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Dynamische velden (locatie-type fields)' })
  @IsOptional()
  @IsObject()
  technicalData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
