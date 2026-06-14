import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { AddValueDto } from './add-value.dto';

export class CreateStandaloneMeasurementDto {
  @ApiProperty({ description: 'Locatie binnen het inspectieplan' })
  @IsUUID()
  locationId: string;

  @ApiProperty({ example: 'isolatiemeting', description: 'Vrij meettype (geen lookup)' })
  @IsString()
  measurementType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: () => [AddValueDto],
    description: 'Optionele meetwaarden om direct mee aan te maken',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddValueDto)
  values?: AddValueDto[];
}
