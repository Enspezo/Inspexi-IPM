import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { NoteEntityType } from '@prisma/client';

export class ListNotesQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken in notitietekst' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: NoteEntityType })
  @IsOptional()
  @IsEnum(NoteEntityType)
  entityType?: NoteEntityType;

  @ApiPropertyOptional({ description: 'Filter op specifieke entiteit ID' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

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
}
