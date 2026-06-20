import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { FAVORITABLE_ENTITY_TYPES } from '../favorites.constants';

/**
 * Optional filter for the grouped favorites list. When omitted, all favoritable
 * groups are returned; when given, only that group appears.
 */
export class ListFavoritesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter op één entiteitstype',
    enum: FAVORITABLE_ENTITY_TYPES,
  })
  @IsOptional()
  @IsIn(FAVORITABLE_ENTITY_TYPES as unknown as string[], {
    message: 'Onbekend entiteitstype',
  })
  entityType?: string;
}
