import {
  IsArray,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateHelpArticleDto {
  @IsUUID() categoryId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(300) excerpt?: string;
  @IsString() body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) moduleKeys?: string[];
  @IsOptional() @IsInt() order?: number;
  /** Alleen SUPERUSER; ORG_ADMIN geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
