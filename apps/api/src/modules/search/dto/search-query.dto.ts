import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SearchEntityType {
  CONTACT = 'contact',
  CONTACT_PERSON = 'contactPerson',
  REQUEST = 'request',
  QUOTE = 'quote',
  TASK = 'task',
  DOCUMENT = 'document',
  PRODUCT = 'product',
}

export class SearchQueryDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 100 })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({
    description: 'Filter op één entiteitstype',
    enum: SearchEntityType,
  })
  @IsOptional()
  @IsEnum(SearchEntityType)
  type?: SearchEntityType;

  @ApiPropertyOptional({ default: 4, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 4;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}
