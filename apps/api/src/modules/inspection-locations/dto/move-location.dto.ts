import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsInt } from 'class-validator';

export class MoveLocationDto {
  @ApiPropertyOptional({ description: 'Nieuwe ouder (null = root)' })
  @IsOptional()
  @IsUUID()
  newParentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
