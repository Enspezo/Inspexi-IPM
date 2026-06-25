import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateMeasurementInstrumentDto } from './create-instrument.dto';

/**
 * Meetmiddel bijwerken. Alle velden optioneel; `assignedToUserId` mag expliciet
 * `null` zijn om de toewijzing op te heffen ("op voorraad") — daarom uit de
 * PartialType-basis geweerd en hieronder opnieuw gedeclareerd.
 */
export class UpdateMeasurementInstrumentDto extends PartialType(
  OmitType(CreateMeasurementInstrumentDto, ['assignedToUserId'] as const),
) {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Toegewezen inspecteur; `null` = op voorraad',
  })
  @IsOptional()
  @ValidateIf((o) => o.assignedToUserId !== null)
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  assignedToUserId?: string | null;
}
