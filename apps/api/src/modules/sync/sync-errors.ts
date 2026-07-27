// WP-C3 (B-212): per-record foutafhandeling voor /sync push + resolve.
//
// De rauwe Prisma-message bevat (zeker in dev) het absolute serverpad,
// broncoderegels rond het faalpunt en de volledige payload incl. orgId/createdBy.
// Die tekst reisde vóór deze fix letterlijk mee in `errors[].error` en bleef in
// `syncRetryMeta.lastError` op het toestel achter. Vanaf nu:
//   - eigen HttpExceptions (BadRequest/Forbidden/NotFound/Conflict) zijn al
//     functionele NL-meldingen → ongewijzigd doorgeven;
//   - alle overige fouten worden gemapt naar een korte NL-melding en de
//     volledige exceptie wordt ALLEEN server-side gelogd, mét correlatie-id
//     (requestId van de push, anders een random referentie) zodat support de
//     client-melding aan de serverlog kan koppelen.

import { HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requestContext } from '@/common/services/request-context';

/**
 * NL-vertaling per Prisma-foutcode — bewust dezelfde teksten als de globale
 * `AllExceptionsFilter`, zodat REST- en sync-meldingen gelijk klinken.
 */
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2000: 'Een waarde is te lang voor dit veld',
  P2002: 'Deze waarde bestaat al',
  P2003: 'Verwijzing naar niet-bestaande gegevens',
  P2011: 'Verplicht veld ontbreekt',
  P2020: 'Een waarde valt buiten het toegestane bereik',
  P2025: 'Gegevens niet gevonden',
};

/**
 * Map een per-record sync-fout naar een client-veilige NL-melding.
 * Niet-HttpExceptions worden server-side volledig gelogd onder een
 * correlatie-id; de client krijgt alleen de korte melding + referentie.
 */
export function toClientSyncError(
  e: unknown,
  logger: Logger,
  ref: { entityType: string; entityId: string },
): string {
  // Eigen guards/validatie: al functioneel + NL (bv. "Record niet gevonden",
  // "Inspectieplan niet gevonden", vier-ogen-melding). Geen implementatiedetails.
  if (e instanceof HttpException) return e.message;

  const correlationId =
    requestContext.getStore()?.requestId ?? randomUUID().slice(0, 8);
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  logger.error(
    `Sync-record ${ref.entityType}/${ref.entityId} gefaald [ref=${correlationId}]: ${detail}`,
    e instanceof Error ? e.stack : undefined,
  );

  let message = 'Onverwachte fout bij het verwerken van dit record';
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    message =
      PRISMA_ERROR_MESSAGES[e.code] ??
      'Databasefout bij het verwerken van dit record';
  } else if (e instanceof Prisma.PrismaClientValidationError) {
    message = 'Ongeldige gegevens voor dit record';
  }
  return `${message} (referentie ${correlationId})`;
}
