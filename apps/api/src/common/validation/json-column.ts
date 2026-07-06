// Runtime-validatie voor Prisma JSON-kolommen (service-laag + /sync-push).
//
// De kolommen zijn bewust vormvrij (custom velden, checklist-resultaten, meetdata),
// dus de schema's zijn PERMISSIEF: ze borgen alleen de top-level JSON-vorm (object vs
// array) en laten onbekende keys/inhoud ongemoeid. Doel is garbage tegenhouden
// (bv. een string of array waar een object hoort) zonder bestaande data te breken.

import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Permissief "plain object" (Record). Blokkeert arrays en primitieven, maar laat
 * álle keys/inhoud door — geschikt voor vormvrije JSON-object-kolommen.
 */
export const jsonObjectSchema = z.custom<Record<string, unknown>>(
  (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  { message: 'moet een object zijn' },
);

/** Permissieve JSON-array. Blokkeert niet-arrays; de inhoud blijft ongemoeid. */
export const jsonArraySchema: z.ZodType<unknown[]> = z.array(z.unknown());

/**
 * Valideert een waarde voor een JSON-kolom vóór een Prisma-schrijfactie.
 *
 * - `undefined` → ongemoeid doorgelaten (partial PATCH: niets te valideren).
 * - schema-mismatch → `BadRequestException` (400) met Nederlandse melding, in lijn
 *   met de bestaande ValidationPipe-stijl.
 * - anders → de (ongewijzigde) waarde.
 */
export function validateJsonColumn<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T | undefined {
  if (value === undefined) return undefined;
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? 'ongeldige structuur';
    throw new BadRequestException(`Ongeldige ${label}: ${detail}`);
  }
  return result.data;
}
