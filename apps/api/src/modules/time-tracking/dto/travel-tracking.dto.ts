import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Opt-in/opt-out van de onderweg-tracker (PRD-16 §6.1) — alleen de gebruiker zelf. */
export class UpdateTravelTrackingDto {
  @ApiProperty({ description: 'Reisdetectie & locatie delen aan/uit' })
  @IsBoolean()
  enabled: boolean;
}

export class LocationPingDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ description: 'GPS-nauwkeurigheid in meters' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  accuracyM?: number;

  @ApiProperty()
  @IsDateString()
  recordedAt: string;
}

/** Batch pings van de PWA tijdens een lopende REISTIJD-timer (PRD-16 §6.2). */
export class IngestPingsDto {
  @ApiProperty({ type: [LocationPingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LocationPingDto)
  pings: LocationPingDto[];
}
