import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'NEN1010 Inspectie' })
  @IsString()
  name: string;

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

  @ApiPropertyOptional({ example: 'inspectie' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
