import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

/** Naam + volledige set weekslots in één payload (PRD 12.6). */
export class CreateAvailabilityTemplateDto {
  @ApiProperty({ example: 'Standaard' })
  @IsString()
  @MinLength(1, { message: 'Naam is verplicht' })
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Fulltime ma–vr 08:00–17:30' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [AvailabilityTemplateSlotDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Een template heeft minimaal één tijdslot nodig' })
  @ValidateNested({ each: true })
  @Type(() => AvailabilityTemplateSlotDto)
  slots!: AvailabilityTemplateSlotDto[];
}
