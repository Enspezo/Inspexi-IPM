import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilityTemplateSlotDto } from './availability-template-slot.dto';

/**
 * Partiële update. Wanneer `slots` wordt meegegeven, wordt de volledige
 * slot-set integraal vervangen (delete + recreate in een transactie).
 * Weggelaten `slots` laat de bestaande sloten ongemoeid.
 */
export class UpdateAvailabilityTemplateDto {
  @ApiPropertyOptional({ example: 'Standaard 40u' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Naam mag niet leeg zijn' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [AvailabilityTemplateSlotDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Een template heeft minimaal één tijdslot nodig' })
  @ValidateNested({ each: true })
  @Type(() => AvailabilityTemplateSlotDto)
  slots?: AvailabilityTemplateSlotDto[];
}
