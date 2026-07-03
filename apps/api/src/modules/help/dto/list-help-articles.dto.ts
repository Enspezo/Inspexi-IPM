import { IsOptional, IsString, IsUUID, IsInt, IsIn, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { HelpArticleStatus, HelpAudience } from '@prisma/client';

export class ListHelpArticlesDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(Object.values(HelpArticleStatus)) status?: HelpArticleStatus;
  /** Filter op doelgroep (beheer: INTERNAL vs EXTERNAL tab). */
  @IsOptional() @IsEnum(HelpAudience) audience?: HelpAudience;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
