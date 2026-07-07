import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { HelpAudience } from '@prisma/client';

export class CreateHelpCategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsUUID() parentId?: string;
  /** INTERNAL (staff-portal, standaard) of EXTERNAL (klantportaal, per-org). */
  @IsOptional() @IsEnum(HelpAudience) audience?: HelpAudience;
  /** Alleen relevant bij EXTERNAL: true = publiek (zonder login), false = achter klant-login. */
  @IsOptional() @IsBoolean() isPublic?: boolean;
  /** Alleen SUPERUSER mag dit zetten; null/weglaten = globaal. ORG_ADMIN wordt server-side geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
