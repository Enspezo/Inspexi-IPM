import { IsOptional, IsString, IsUUID, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { HelpArticleStatus } from '@prisma/client';

export class ListHelpArticlesDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(Object.values(HelpArticleStatus)) status?: HelpArticleStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
