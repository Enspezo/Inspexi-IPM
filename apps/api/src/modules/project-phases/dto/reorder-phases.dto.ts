import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderPhasesDto {
  @ApiProperty({
    type: [String],
    description:
      'Fase-IDs in de gewenste volgorde. Moet exact de niet-verwijderde fasen van het project bevatten.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedIds: string[];
}
