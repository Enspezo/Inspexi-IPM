import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAvailabilityExceptionDto } from './create-availability-exception.dto';

/**
 * Partial-update van een uitzondering. `userId` ligt vast (de uitzondering
 * verhuist niet naar een andere inspecteur); de effectieve velden worden na
 * de merge met het bestaande record opnieuw gevalideerd.
 */
export class UpdateAvailabilityExceptionDto extends PartialType(
  OmitType(CreateAvailabilityExceptionDto, ['userId'] as const),
) {}
