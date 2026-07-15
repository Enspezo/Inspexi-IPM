import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class ConfirmActionDto {
  @ApiPropertyOptional({
    description:
      'Optioneel bijgewerkte argumenten (de "Aanpassen"-knop op de bevestigingskaart)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  args?: Record<string, any>;
}
