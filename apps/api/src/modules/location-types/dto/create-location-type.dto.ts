import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsArray,
  IsEnum,
} from 'class-validator';
import { LocationTypeScope } from '@prisma/client';

export class CreateLocationTypeDto {
  @ApiProperty({ example: 'gebouw' })
  @IsString()
  code: string;

  @ApiPropertyOptional({
    example: 'GEB',
    description: 'Shortcode voor de [typecode]-placeholder in de locatie-nummering',
  })
  @IsOptional()
  @IsString()
  shortCode?: string;

  @ApiProperty({ example: 'Gebouw' })
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

  @ApiPropertyOptional({
    enum: LocationTypeScope,
    default: LocationTypeScope.INSPECTION,
    description: 'Bereik: INSPECTION (inspectiedomein) of CRM (relatie-locaties)',
  })
  @IsOptional()
  @IsEnum(LocationTypeScope)
  scope?: LocationTypeScope;

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
