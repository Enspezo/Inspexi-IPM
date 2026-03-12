import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { NoteEntityType } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListNotesQueryDto extends BasePaginationQueryDto {
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
}
