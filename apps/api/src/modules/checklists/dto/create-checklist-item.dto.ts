import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateChecklistItemDto {
  @ApiPropertyOptional({ example: 'NEN1010-001', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: 'Is de hoofdschakelaar goed bereikbaar?' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question: string;

  @ApiPropertyOptional({ description: 'Toelichting / werkinstructie' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;

  @ApiPropertyOptional({ example: 'NEN 1010 art. 5.3' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  normReference?: string;

  @ApiPropertyOptional({ description: 'Categorie (org of systeem)' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Systeem-item (alleen SUPERUSER)', default: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
