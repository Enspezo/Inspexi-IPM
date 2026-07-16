import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class AssignInspectorsDto {
  @ApiProperty({ type: [String], description: 'Lijst van user IDs van inspecteurs (eerste wordt hoofdinspecteur)' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  inspectorIds: string[];

  @ApiPropertyOptional({ description: 'User ID van de hoofdinspecteur (standaard de eerste in de lijst)' })
  @IsOptional()
  @IsUUID()
  primaryInspectorId?: string;

  @ApiPropertyOptional({ description: 'Negeer beschikbaarheidswaarschuwingen en wijs toch toe (PRD-12 §12.9)' })
  @IsOptional()
  @IsBoolean()
  overrideAvailabilityWarnings?: boolean;
}
