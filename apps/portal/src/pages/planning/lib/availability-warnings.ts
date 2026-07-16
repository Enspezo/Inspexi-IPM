/**
 * Beschikbaarheids-waarschuwingen uit de planning-integratie (PRD-12 §12.9).
 *
 * De backend geeft bij een onbeschikbare inspecteur een 409 met een
 * `warnings`-array in de foutbody. Deze helpers lezen die payload uit de
 * `ApiClientError` en formatteren een Nederlandse bevestigingsvraag. Bewust
 * React-vrij zodat ze los te unit-testen zijn (Vitest).
 */
import { ApiClientError, getErrorMessage } from '@/lib/api-client';
import { formatDateLongUTC } from '@/components/availability/format-availability';

/** Eén onbeschikbare inspecteur zoals de backend die meestuurt. */
export interface AvailabilityWarning {
  userId: string;
  name: string;
  date: string; // YYYY-MM-DD
  reason: string;
}

function isAvailabilityWarning(value: unknown): value is AvailabilityWarning {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.userId === 'string' &&
    typeof w.name === 'string' &&
    typeof w.date === 'string' &&
    typeof w.reason === 'string'
  );
}

/**
 * Haalt de beschikbaarheids-waarschuwingen uit een fout. Levert een lege lijst
 * wanneer het geen 409-met-warnings is (dan geldt de normale foutafhandeling).
 */
export function extractAvailabilityWarnings(error: unknown): AvailabilityWarning[] {
  if (!(error instanceof ApiClientError) || error.statusCode !== 409) return [];
  const warnings = error.data?.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter(isAvailabilityWarning);
}

/** "Tom Visser is niet beschikbaar op 7 september 2026 (Verlof — hele dag geblokkeerd)." */
export function formatAvailabilityWarning(warning: AvailabilityWarning): string {
  return `${warning.name} is niet beschikbaar op ${formatDateLongUTC(warning.date)} (${warning.reason}).`;
}

/**
 * `onError` voor planning-mutaties die een beschikbaarheids-409 kunnen geven:
 * die specifieke 409 wordt door de confirm-flow afgehandeld en mag géén
 * (dubbele) toast tonen; elke andere fout valt terug op de normale error-toast.
 */
export function makeAvailabilityAwareOnError(
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void,
) {
  return (error: unknown): void => {
    if (extractAvailabilityWarnings(error).length > 0) return;
    showToast(getErrorMessage(error, 'Er is iets misgegaan'), 'error');
  };
}
