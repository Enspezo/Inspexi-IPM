import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateWorkOrderDto {
  @ApiPropertyOptional({ description: 'Projectfase ID (null om te ontkoppelen). Koppeling loopt volledig via de fase (PRD-12).', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  projectPhaseId?: string | null;

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
