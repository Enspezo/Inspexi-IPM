import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignToProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { each: true })
  requestIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { each: true })
  quoteIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { each: true })
  planningItemIds?: string[];
}
