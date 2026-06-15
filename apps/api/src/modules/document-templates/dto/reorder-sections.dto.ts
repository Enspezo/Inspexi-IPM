import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderSectionsDto {
  @ApiProperty({ type: [String], description: 'Sectie-IDs in de gewenste volgorde' })
  @IsArray()
  @IsUUID('all', { each: true })
  sectionIds: string[];
}
