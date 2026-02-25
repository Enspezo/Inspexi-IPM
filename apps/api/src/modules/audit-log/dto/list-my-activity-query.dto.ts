import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';

const VALID_ENTITY_TYPES = [
  'Contact', 'ContactPerson', 'Location', 'CustomerGroup',
  'Product', 'PriceTable', 'PriceTableItem',
  'Request', 'Quote', 'QuoteLine', 'QuoteTemplate',
  'User', 'Organization',
];

export class ListMyActivityQueryDto {
  @ApiPropertyOptional({ description: 'Filter op entiteitstype', enum: VALID_ENTITY_TYPES })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter op actie', enum: ['CREATE', 'UPDATE', 'DELETE'] })
  @IsOptional()
  @IsIn(['CREATE', 'UPDATE', 'DELETE'])
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Datum vanaf (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Datum tot (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

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
