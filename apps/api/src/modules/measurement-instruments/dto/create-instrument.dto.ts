import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MeasurementInstrumentStatus } from '@prisma/client';

/** Meetmiddel aanmaken (JSON). */
export class CreateMeasurementInstrumentDto {
  @ApiProperty({ example: 'MM-001', description: 'Uniek nummer (uniek per organisatie)' })
  @IsString()
  @IsNotEmpty({ message: 'Nummer is verplicht' })
  @MaxLength(100, { message: 'Nummer mag maximaal 100 tekens bevatten' })
  code: string;

  @ApiProperty({ example: 'Fluke', description: 'Merk' })
  @IsString()
  @IsNotEmpty({ message: 'Merk is verplicht' })
  @MaxLength(200, { message: 'Merk mag maximaal 200 tekens bevatten' })
  brand: string;

  @ApiProperty({ example: '1587 FC', description: 'Type' })
  @IsString()
  @IsNotEmpty({ message: 'Type is verplicht' })
  @MaxLength(200, { message: 'Type mag maximaal 200 tekens bevatten' })
  type: string;

  @ApiPropertyOptional({ example: 'SN-12345', description: 'Serienummer (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Serienummer mag maximaal 200 tekens bevatten' })
  serialNumber?: string;

  @ApiProperty({ example: 12, description: 'Kalibratie-interval in maanden' })
  @IsInt({ message: 'Interval moet een geheel aantal maanden zijn' })
  @Min(1, { message: 'Interval moet minimaal 1 maand zijn' })
  @Max(600, { message: 'Interval mag maximaal 600 maanden zijn' })
  calibrationIntervalMonths: number;

  @ApiPropertyOptional({ enum: MeasurementInstrumentStatus, description: 'Levenscyclus-status' })
  @IsOptional()
  @IsEnum(MeasurementInstrumentStatus, { message: 'Ongeldige status' })
  status?: MeasurementInstrumentStatus;

  @ApiPropertyOptional({ description: 'Toegewezen inspecteur (leeg = op voorraad)' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  assignedToUserId?: string;

  @ApiPropertyOptional({ description: 'Notitie (optioneel)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Notitie mag maximaal 2000 tekens bevatten' })
  notes?: string;
}
