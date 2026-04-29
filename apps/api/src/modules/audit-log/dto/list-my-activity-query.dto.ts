import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

const VALID_ENTITY_TYPES = [
  'Contact', 'ContactPerson', 'Location', 'CustomerGroup',
  'Product', 'PriceTable', 'PriceTableItem',
  'Request', 'Quote', 'QuoteLine', 'QuoteTemplate',
  'User', 'Organization',
];

export class ListMyActivityQueryDto extends BasePaginationQueryDto {
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
}
