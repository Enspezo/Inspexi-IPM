import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreateWorkOrderDto {
  @ApiPropertyOptional({ description: 'Planning item ID (optioneel, kan later gekoppeld worden)' })
  @IsOptional()
  @IsUUID()
  planningItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endTime?: string;
}
