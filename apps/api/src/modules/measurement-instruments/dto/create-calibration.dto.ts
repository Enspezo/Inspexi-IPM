import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Kalibratie toevoegen. Ontvangen als `multipart/form-data` (optioneel
 * `file`-veld voor het certificaat), dus waarden komen als string binnen.
 */
export class CreateCalibrationDto {
  @ApiProperty({ example: '2026-06-01', description: 'Kalibratiedatum (ISO)' })
  @IsDateString({}, { message: 'Ongeldige kalibratiedatum' })
  calibrationDate: string;

  @ApiProperty({ example: 'KalibratieLab BV', description: 'Uitvoerende instantie' })
  @IsString()
  @IsNotEmpty({ message: 'Uitvoerende instantie is verplicht' })
  @MaxLength(200, { message: 'Instantie mag maximaal 200 tekens bevatten' })
  performedBy: string;

  @ApiPropertyOptional({ example: 'CAL-2026-0001', description: 'Certificaatnummer (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Certificaatnummer mag maximaal 120 tekens bevatten' })
  certificateNumber?: string;

  @ApiPropertyOptional({ description: 'Notitie (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Notitie mag maximaal 2000 tekens bevatten' })
  notes?: string;
}
