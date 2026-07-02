import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsArray,
} from 'class-validator';

export class CreateAssetTypeDto {
  @ApiProperty({ example: 'verdeler' })
  @IsString()
  code: string;

  @ApiPropertyOptional({
    example: 'VERD',
    description: 'Shortcode voor de [typecode]-placeholder in de asset-nummering',
  })
  @IsOptional()
  @IsString()
  shortCode?: string;

  @ApiProperty({ example: 'Verdeelinrichting' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Lucide-icon naam' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ type: [String], description: 'Normcodes waarvoor dit type geldt' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  normTypes?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
