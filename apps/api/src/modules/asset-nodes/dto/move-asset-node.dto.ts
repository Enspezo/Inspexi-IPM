import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsInt } from 'class-validator';

export class MoveAssetNodeDto {
  @ApiProperty({ description: 'Nieuwe ouder-node (binnen dezelfde boom)' })
  @IsUUID()
  newParentId: string;

  @ApiPropertyOptional({ description: 'Nieuwe positie onder de ouder' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
