import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOptionDto {
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

export class CreateCharacteristicDto {
  @ApiProperty({ example: 'STATUS' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Code mag alleen hoofdletters, cijfers of underscores bevatten',
  })
  code: string;

  @ApiProperty({ example: 'Status' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ type: [CreateOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}

export class CreateClassificationModelDto {
  @ApiProperty({ example: 'NEN1010_AFKEUR' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message:
      'Code mag alleen hoofdletters, cijfers, underscores of streepjes bevatten',
  })
  code: string;

  @ApiProperty({ example: 'NEN 1010 afkeurmodel' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ type: [CreateCharacteristicDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCharacteristicDto)
  characteristics: CreateCharacteristicDto[];
}
