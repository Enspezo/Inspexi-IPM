import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class CreateWorkOrderDto {
  @ApiPropertyOptional({ description: 'Handmatig werkbonnummer (alleen als handmatige nummering aanstaat)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  workOrderNumber?: string;

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
