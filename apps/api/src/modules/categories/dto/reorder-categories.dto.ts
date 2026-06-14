import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CategoryOrderItemDto {
  @ApiProperty({ description: 'UUID van de categorie' })
  @IsUUID('4')
  id: string;

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [CategoryOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryOrderItemDto)
  items: CategoryOrderItemDto[];
}
