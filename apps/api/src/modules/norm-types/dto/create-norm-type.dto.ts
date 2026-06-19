import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  MinLength,
  MaxLength,
  Matches,
  IsUUID,
} from 'class-validator';

export class CreateNormTypeDto {
  @ApiProperty({ example: 'NEN1010' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Code mag alleen hoofdletters, cijfers of underscores bevatten',
  })
  code: string;

  @ApiProperty({ example: 'NEN 1010' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: [String], description: 'Asset-type codes die bij deze norm horen' })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiPropertyOptional({ description: 'Optioneel gekoppeld classificatiemodel' })
  @IsOptional()
  @IsUUID()
  classificationModelId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
