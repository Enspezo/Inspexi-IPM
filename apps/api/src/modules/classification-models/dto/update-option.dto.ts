import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: '#DC2626' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Kleur moet een geldige hex-kleur zijn (bijv. #DC2626)',
  })
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sortOrder?: number;

  /** Markeert deze optie als "kritiek" (PRD-14, → Finding.isCritical). */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;
}
