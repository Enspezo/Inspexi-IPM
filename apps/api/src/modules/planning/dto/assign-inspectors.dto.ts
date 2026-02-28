import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsUUID, IsOptional } from 'class-validator';

export class AssignInspectorsDto {
  @ApiProperty({ type: [String], description: 'Lijst van user IDs van inspecteurs (eerste wordt hoofdinspecteur)' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  inspectorIds: string[];

  @ApiPropertyOptional({ description: 'User ID van de hoofdinspecteur (standaard de eerste in de lijst)' })
  @IsOptional()
  @IsUUID()
  primaryInspectorId?: string;
}
