import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { HelpAudience } from '@prisma/client';

export class CreateHelpArticleDto {
  @IsUUID() categoryId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(300) excerpt?: string;
  @IsString() body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) moduleKeys?: string[];
  @IsOptional() @IsInt() order?: number;
  /** INTERNAL (staff-portal, standaard) of EXTERNAL (klantportaal, per-org). */
  @IsOptional() @IsEnum(HelpAudience) audience?: HelpAudience;
  /** Alleen SUPERUSER; ORG_ADMIN geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
