import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { NumberingMode, NumberingReset } from '@prisma/client';
import { NUMBERING_LIMITS } from '../numbering.helpers';

/**
 * Patch a per-(org, model) numbering scheme. Model is taken from the route; all
 * fields are optional. Prefix/suffix charset + allowed placeholders are validated
 * model-aware in the service (the model isn't known at the DTO layer).
 */
export class UpdateNumberingSchemeDto {
  @ApiPropertyOptional({ example: 'OFF-[jaar]-', description: 'Voorvoegsel (mag placeholders bevatten)' })
  @IsOptional()
  @IsString()
  @MaxLength(NUMBERING_LIMITS.maxAffixLength)
  prefix?: string;

  @ApiPropertyOptional({ example: '', description: 'Achtervoegsel (mag placeholders bevatten)' })
  @IsOptional()
  @IsString()
  @MaxLength(NUMBERING_LIMITS.maxAffixLength)
  suffix?: string;

  @ApiPropertyOptional({ enum: NumberingMode })
  @IsOptional()
  @IsEnum(NumberingMode)
  mode?: NumberingMode;

  @ApiPropertyOptional({ example: 1, description: 'Startwaarde (sequential)' })
  @IsOptional()
  @IsInt()
  @Min(NUMBERING_LIMITS.minStart)
  @Max(NUMBERING_LIMITS.maxStart)
  start?: number;

  @ApiPropertyOptional({ example: 1, description: 'Ophoging per nummer' })
  @IsOptional()
  @IsInt()
  @Min(NUMBERING_LIMITS.minInterval)
  @Max(NUMBERING_LIMITS.maxInterval)
  interval?: number;

  @ApiPropertyOptional({ example: 4, description: 'Aantal cijfers (zero-pad)' })
  @IsOptional()
  @IsInt()
  @Min(NUMBERING_LIMITS.minDigits)
  @Max(NUMBERING_LIMITS.maxDigits)
  digits?: number;

  @ApiPropertyOptional({ enum: NumberingReset })
  @IsOptional()
  @IsEnum(NumberingReset)
  resetPolicy?: NumberingReset;

  @ApiPropertyOptional({ example: false, description: 'Handmatig nummer toestaan per record' })
  @IsOptional()
  @IsBoolean()
  allowManualEntry?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
