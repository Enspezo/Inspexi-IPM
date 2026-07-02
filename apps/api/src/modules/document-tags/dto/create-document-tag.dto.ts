import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentTagDto {
  @ApiProperty({ example: 'Keuringsrapport' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '#3B82F6', description: 'Hex-kleurcode (#RRGGBB)' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Kleur moet een geldige hex-code zijn (bijv. #3B82F6)',
  })
  color: string;

  @ApiPropertyOptional({ example: 0, description: 'Volgorde voor weergave' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
