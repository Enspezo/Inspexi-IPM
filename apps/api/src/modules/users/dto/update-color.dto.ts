import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateColorDto {
  @ApiPropertyOptional({ example: '#3B82F6', description: 'HEX kleurcode voor kalenderweergave (null om te wissen)' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Kleur moet een geldige HEX kleurcode zijn, bijv. #3B82F6' })
  color?: string | null;
}
