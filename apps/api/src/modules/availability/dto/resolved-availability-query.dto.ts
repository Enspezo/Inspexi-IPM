import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsArray, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Opvragen van resolved availability over een datumbereik (max 3 maanden,
 * afgedwongen in de service). `userIds` accepteert een komma-gescheiden lijst
 * óf herhaalde query-params; leeg = alle inspecteurs van de org.
 */
export class ResolvedAvailabilityQueryDto {
  @ApiProperty({ example: '2026-07-01', description: 'Vanaf (date-only), inclusief' })
  @IsDateString({}, { message: 'Ongeldige begindatum' })
  from!: string;

  @ApiProperty({ example: '2026-07-31', description: 't/m (date-only), inclusief' })
  @IsDateString({}, { message: 'Ongeldige einddatum' })
  to!: string;

  @ApiPropertyOptional({ description: 'Komma-gescheiden of herhaalde user-ids' })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.flatMap((v: string) => String(v).split(','));
    if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
    return value;
  })
  @IsArray()
  @IsUUID(undefined, { each: true, message: 'Ongeldige gebruiker' })
  userIds?: string[];
}
