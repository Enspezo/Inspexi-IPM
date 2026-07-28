import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { MeasurementInstrumentStatus } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

const CALIBRATION_STATUSES = ['GEEN_KALIBRATIE', 'GELDIG', 'BINNENKORT', 'VERLOPEN'] as const;

/** Filters voor de meetmiddelen-lijst. */
export class QueryMeasurementInstrumentsDto extends BasePaginationQueryDto {
  // `limit` volgt de basiscap (200) — de vroegere @Max(200)-override is vervallen;
  // de lijst laadt "alles" (portal limit=200) voor client-side filtering.

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
