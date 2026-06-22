import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsUUID, IsObject, Min, Max, MaxLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'NEN1010 Inspectie' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Handmatige productcode (alleen als handmatige nummering aanstaat)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  productCode?: string;

  @ApiProperty({ example: 'uur', description: 'stuks | uur | m2 | m | dag | traject | km' })
  @IsString()
  unit: string;

  @ApiPropertyOptional({ example: 'Elektrische inspectie conform NEN1010' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 21, default: 21 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultVat?: number;

  @ApiPropertyOptional({ example: 'uuid-of-product-group' })
  @IsOptional()
  @IsUUID()
  productGroupId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Eigen velden (key-value JSON)' })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
