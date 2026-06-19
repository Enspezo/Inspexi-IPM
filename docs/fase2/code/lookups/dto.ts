// Doel in apps/api: src/modules/lookups/dto/index.ts (of gesplitst per bestand)

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Matches,
} from 'class-validator';

export class CreateLookupDto {
  @ApiProperty({ example: 'in_review', description: 'Stabiele code (a-z, 0-9, _)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'code mag alleen letters, cijfers en _ bevatten' })
  code: string;

  @ApiProperty({ example: 'In review' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ example: '#F59E0B', description: 'HEX-kleur voor badge' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// `code` is niet wijzigbaar na aanmaken (stabiele identifier); alleen label/kleur/volgorde/actief.
export class UpdateLookupDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
