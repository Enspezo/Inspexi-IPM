import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

/**
 * NL-variant van Nest's `ParseUUIDPipe` (WP-C1 / B-155).
 *
 * De default `exceptionFactory` geeft het Engelse
 * "Validation failed (uuid is expected)"; deze pipe geeft dezelfde 400 met een
 * Nederlandse melding. Gebruik ALTIJD deze pipe in controllers:
 *
 * ```ts
 * @Param('id', ParseUuidPipe) id: string
 * ```
 */
@Injectable()
export class ParseUuidPipe extends ParseUUIDPipe {
  constructor() {
    super({
      exceptionFactory: () => new BadRequestException('Ongeldige identificatie'),
    });
  }
}
