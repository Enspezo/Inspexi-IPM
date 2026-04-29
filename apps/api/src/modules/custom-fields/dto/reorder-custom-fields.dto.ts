import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderCustomFieldsDto {
  @ApiProperty({ description: 'Ordered array of custom field definition IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedIds: string[];
}
