import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateMeasurementSheetTemplateDto {
  @ApiProperty({ example: 'NEN1010_HOOFDVERDELER' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message:
      'Code mag alleen hoofdletters, cijfers, underscores en koppeltekens bevatten',
  })
  code: string;

  @ApiProperty({ example: 'Meetstaat Hoofdverdeler NEN 1010' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'NEN1010', description: 'Normcode (NormTypeDefinition.code)' })
  @IsString()
  normType: string;

  @ApiProperty({ type: [String], example: ['hoofdverdeler'] })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationTypes?: string[];
}
