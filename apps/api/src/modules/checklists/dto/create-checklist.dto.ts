import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateChecklistDto {
  @ApiPropertyOptional({ example: 'CL-NEN1010-VERDELER', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: 'Inspectie verdeelinrichting NEN 1010' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Normcode (verwijst naar NormTypeDefinition)', example: 'NEN1010' })
  @IsString()
  normTypeCode: string;

  @ApiProperty({ type: [String], description: 'Asset-type codes waarvoor de checklist geldt' })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiPropertyOptional({ type: [String], description: 'Locatie-type codes waarvoor de checklist geldt' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationTypes?: string[];

  @ApiPropertyOptional({ description: 'Systeem-checklist (alleen SUPERUSER)', default: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
