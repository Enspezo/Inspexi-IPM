import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsArray } from 'class-validator';

export class ReorderAssetsDto {
  @ApiPropertyOptional({ description: 'Ouder waarbinnen wordt herordend (null = root)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds: string[];
}
