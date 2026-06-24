import { IsOptional, IsString, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateHelpCategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsUUID() parentId?: string;
  /** Alleen SUPERUSER mag dit zetten; null/weglaten = globaal. ORG_ADMIN wordt server-side geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
