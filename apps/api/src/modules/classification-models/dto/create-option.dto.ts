import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateOptionStandaloneDto {
  @ApiProperty({ example: 'GOEDGEKEURD' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Code mag alleen hoofdletters, cijfers of underscores bevatten',
  })
  code: string;

  @ApiProperty({ example: 'Goedgekeurd' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '#16A34A' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Kleur moet een geldige hex-kleur zijn (bijv. #DC2626)',
  })
  color: string;

  @ApiPropertyOptional()
  @IsOptional()
  sortOrder?: number;
}
