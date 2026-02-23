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
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteLineDto {
  @ApiPropertyOptional({ description: 'Product ID (optioneel voor vrije regels)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ example: 'NEN1010 Inspectie' })
  @IsString()
  description: string;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 'uur' })
  @IsString()
  unit: string;

  @ApiProperty({ example: 85.0 })
  @IsNumber()
  unitPrice: number;

  @ApiPropertyOptional({ example: 21, default: 21 })
  @IsOptional()
  @IsNumber()
  vatRate?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
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
