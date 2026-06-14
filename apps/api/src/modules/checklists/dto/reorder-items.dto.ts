import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class ReorderItemsDto {
  @ApiProperty({ type: [String], description: 'IDs van de item-links in de gewenste volgorde' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  itemLinkIds: string[];
}
