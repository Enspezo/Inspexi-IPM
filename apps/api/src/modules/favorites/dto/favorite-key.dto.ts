import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { FAVORITABLE_ENTITY_TYPES } from '../favorites.constants';

/**
 * Identifies a single favoritable record by its (entityType, entityId) pair.
 * Used for POST (add) via body and DELETE (remove) via query string.
 */
export class FavoriteKeyDto {
  @ApiProperty({
    description: 'Canoniek entiteitstype (Prisma-modelnaam)',
    enum: FAVORITABLE_ENTITY_TYPES,
  })
  @IsIn(FAVORITABLE_ENTITY_TYPES as unknown as string[], {
    message: 'Onbekend entiteitstype',
  })
  entityType: string;

  @ApiProperty({ description: 'ID van het record', format: 'uuid' })
  @IsUUID()
  entityId: string;
}
