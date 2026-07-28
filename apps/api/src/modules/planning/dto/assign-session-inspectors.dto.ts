import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsArray, IsOptional, IsBoolean } from 'class-validator';

export class AssignSessionInspectorsDto {
  @ApiProperty({ example: ['uuid1', 'uuid2'], description: 'Lijst van inspecteur user IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  inspectorIds: string[];

  @ApiPropertyOptional({ example: 'uuid1', description: 'Primaire inspecteur (default: eerste in de lijst)' })
  @IsOptional()
  @IsUUID()
  primaryInspectorId?: string;

  @ApiPropertyOptional({ description: 'Negeer beschikbaarheidswaarschuwingen en wijs toch toe (PRD-12 §12.9)' })
  @IsOptional()
  @IsBoolean()
  overrideAvailabilityWarnings?: boolean;
}
