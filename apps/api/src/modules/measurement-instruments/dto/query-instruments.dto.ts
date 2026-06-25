import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { MeasurementInstrumentStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

const CALIBRATION_STATUSES = ['GEEN_KALIBRATIE', 'GELDIG', 'BINNENKORT', 'VERLOPEN'] as const;

/** Filters voor de meetmiddelen-lijst. */
export class QueryMeasurementInstrumentsDto extends BasePaginationQueryDto {
  // Override van de base-cap (@Max(100)): de lijst laadt "alles" voor client-side
  // filtering in de portal (vgl. tasks/quotes), dus we staan tot 200 toe.
  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Zoek op nummer, merk, type of serienummer' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MeasurementInstrumentStatus })
  @IsOptional()
  @IsEnum(MeasurementInstrumentStatus, { message: 'Ongeldige status' })
  status?: MeasurementInstrumentStatus;

  @ApiPropertyOptional({ description: 'Filter op toegewezen inspecteur' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  assignedToUserId?: string;

  @ApiPropertyOptional({ enum: CALIBRATION_STATUSES, description: 'Afgeleide kalibratiestatus' })
  @IsOptional()
  @IsIn(CALIBRATION_STATUSES, { message: 'Ongeldige kalibratiestatus' })
  calibrationStatus?: (typeof CALIBRATION_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Alleen meetmiddelen die aan mij zijn toegewezen' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyMine?: boolean;
}
