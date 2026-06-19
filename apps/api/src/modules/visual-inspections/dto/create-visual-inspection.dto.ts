import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class CreateVisualInspectionDto {
  @ApiPropertyOptional({ description: 'Checklist-resultaten (array van items)', type: [Object] })
  @IsOptional()
  @IsArray()
  checklistResults?: unknown[];

  @ApiPropertyOptional({ description: 'Toegewezen inspecteur (User-id binnen dezelfde org)' })
  @IsOptional()
  @IsUUID()
  inspectorId?: string;
}
