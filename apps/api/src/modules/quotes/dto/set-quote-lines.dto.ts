import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsInt,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Bovengrens voor aantal en eenheidsprijs (B-302/B-303). De geldkolommen zijn
 * `numeric(12,2)`; deze per-veld-grens houdt de invoer zelf binnen dat bereik.
 * Het berekende regel-/offertetotaal wordt daarnaast in `setLines()` bewaakt
 * (MAX_QUOTE_AMOUNT) — twee grote-maar-geldige velden kunnen samen alsnog
 * overlopen.
 */
export const MAX_LINE_VALUE = 9_999_999.99;

export class QuoteLineDto {
  @ApiPropertyOptional({ description: 'Product ID (optioneel voor vrije regels)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ example: 'NEN1010 Inspectie' })
  @IsString()
  description: string;

  @ApiProperty({ example: 3, maximum: MAX_LINE_VALUE })
  @IsNumber({}, { message: 'Aantal moet een getal zijn' })
  @Min(0, { message: 'Aantal mag niet negatief zijn' })
  @Max(MAX_LINE_VALUE, { message: 'Aantal mag maximaal 9.999.999,99 zijn' })
  quantity: number;

  @ApiProperty({ example: 'uur' })
  @IsString()
  unit: string;

  @ApiProperty({ example: 85.0, maximum: MAX_LINE_VALUE })
  @IsNumber({}, { message: 'Eenheidsprijs moet een getal zijn' })
  @Min(0, { message: 'Eenheidsprijs mag niet negatief zijn' })
  @Max(MAX_LINE_VALUE, { message: 'Eenheidsprijs mag maximaal € 9.999.999,99 zijn' })
  unitPrice: number;

  @ApiPropertyOptional({ example: 21, default: 21, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({}, { message: 'Btw-tarief moet een getal zijn' })
  @Min(0, { message: 'Btw-tarief mag niet negatief zijn' })
  @Max(100, { message: 'Btw-tarief mag maximaal 100% zijn' })
  vatRate?: number;

  @ApiPropertyOptional({ example: 0, default: 0, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber({}, { message: 'Korting moet een getal zijn' })
  @Min(0, { message: 'Korting mag niet negatief zijn' })
  @Max(100, { message: 'Korting mag maximaal 100% zijn' })
  discountPct?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetQuoteLinesDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
}
