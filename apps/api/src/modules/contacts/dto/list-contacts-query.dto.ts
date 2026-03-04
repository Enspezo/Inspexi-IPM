import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsBooleanString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactType } from '@prisma/client';

export class ListContactsQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam, email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ContactType })
  @IsOptional()
  @IsEnum(ContactType)
  type?: ContactType;

  @ApiPropertyOptional({ description: 'Alleen mijn relaties tonen' })
  @IsOptional()
  @IsBooleanString()
  onlyMine?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Sorteerveld' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}