import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsUUID } from 'class-validator';

export class UpdateWorkOrderDto {
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
