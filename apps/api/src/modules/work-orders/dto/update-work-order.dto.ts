import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsUUID, MaxLength } from 'class-validator';

export class UpdateWorkOrderDto {
  @ApiPropertyOptional({ description: 'Handmatig werkbonnummer (alleen als handmatige nummering aanstaat)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  workOrderNumber?: string;

  @ApiPropertyOptional({ description: 'Koppel aan planregel (of null om te ontkoppelen)' })
  @IsOptional()
  @IsUUID()
  planningItemId?: string | null;

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
