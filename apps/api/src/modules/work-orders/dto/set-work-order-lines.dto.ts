import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ValidateNested,
  IsOptional,
  IsUUID,
  IsString,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkOrderLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsNumber()
  unitPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetWorkOrderLinesDto {
  @ApiProperty({ type: [WorkOrderLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderLineDto)
  lines: WorkOrderLineDto[];
}
