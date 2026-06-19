import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QuickCreateMeasurementDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Horizontale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionX: number;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'Verticale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionY: number;

  @ApiProperty({ example: 'isolatiemeting', description: 'Vrij meettype (geen lookup)' })
  @IsString()
  measurementType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Label op de marker' })
  @IsOptional()
  @IsString()
  label?: string;
}
