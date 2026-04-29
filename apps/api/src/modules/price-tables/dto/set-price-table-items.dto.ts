import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PriceType } from '@prisma/client';

export class PriceTierDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  fromQty: number;

  @ApiPropertyOptional({ example: 10, description: 'null = onbeperkt' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  toQty?: number;

  @ApiProperty({ example: 50.0 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class PriceTableItemDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: PriceType, example: PriceType.FIXED })
  @IsEnum(PriceType)
  priceType: PriceType;

  @ApiPropertyOptional({ example: 85.0, description: 'Vaste prijs (voor FIXED)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ type: [PriceTierDto], description: 'Staffelprijzen (voor TIERED)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  tiers?: PriceTierDto[];
}

export class SetPriceTableItemsDto {
  @ApiProperty({ type: [PriceTableItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTableItemDto)
  items: PriceTableItemDto[];
}
