import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateProductGroupDto {
  @ApiProperty({ example: 'Inspectie' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Alle inspectie-gerelateerde producten' })
  @IsOptional()
  @IsString()
  notes?: string;
}
