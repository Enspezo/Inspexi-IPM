import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class PdokRefreshDto {
  @ApiPropertyOptional({
    description:
      'Bevestig overschrijven van bestaande gegevens. Zonder `true` wordt bij ' +
      'een afwijking niets opgeslagen maar de gevonden wijzigingen geretourneerd.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
