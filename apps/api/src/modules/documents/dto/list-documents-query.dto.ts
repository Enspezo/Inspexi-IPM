import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID, IsBooleanString } from 'class-validator';
import { DocumentEntityType } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListDocumentsQueryDto extends BasePaginationQueryDto {
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
}
