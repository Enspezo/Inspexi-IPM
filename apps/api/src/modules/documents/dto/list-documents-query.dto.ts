import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsUUID, IsBooleanString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentEntityType } from '@prisma/client';

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op bestandsnaam' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DocumentEntityType })
  @IsOptional()
  @IsEnum(DocumentEntityType)
  entityType?: DocumentEntityType;

  @ApiPropertyOptional({ description: 'Filter op specifieke entiteit ID' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Alleen eigen documenten tonen' })
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