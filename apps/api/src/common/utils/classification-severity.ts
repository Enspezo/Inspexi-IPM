/**
 * Gedeelde severity-detectie voor classificatie-waarden (PRD-14 refactor).
 *
 * Geëxtraheerd uit generated-documents/generation-context.service.ts zodat de
 * document-generatie én de herstel-samenvatting (client-repair, GET session)
 * exact dezelfde logica gebruiken: de "hoofd"-characteristic wordt gekozen op
 * een van de bekende severity-keys (CLASSIFICATIE/RISICO/SEVERITY/PRIORITEIT),
 * anders de eerste key; de optie levert label + kleur (+ isCritical, PRD-14).
 */

export type SeverityClassificationModel = {
  characteristics: Array<{
    code: string;
    options: Array<{ code: string; name: string; color: string; isCritical?: boolean }>;
  }>;
} | null;

export const SEVERITY_CHARACTERISTIC_CODES = [
  'CLASSIFICATIE',
  'RISICO',
  'SEVERITY',
  'PRIORITEIT',
] as const;

/** Kies de severity-characteristic-code uit de aanwezige classificatie-keys. */
export function findSeverityCharacteristicCode(
  classificationValues: Record<string, string>,
): string | undefined {
  return (
    Object.keys(classificationValues).find((k) =>
      (SEVERITY_CHARACTERISTIC_CODES as readonly string[]).includes(k.toUpperCase()),
    ) ?? Object.keys(classificationValues)[0]
  );
}

/** Fallback-kleuren voor bekende optie-codes zonder classificatiemodel. */
const DEFAULT_SEVERITY_COLORS: Record<string, string> = {
  '1': '#dc2626',
  '2': '#ea580c',
  '3': '#ca8a04',
  '4': '#16a34a',
  A: '#dc2626',
  B: '#ea580c',
  C: '#ca8a04',
  D: '#2563eb',
  E: '#16a34a',
};

export interface MainClassification {
  code: string;
  name: string;
  color: string;
  /**
   * true/false zodra de optie via het classificatiemodel geresolved is (PRD-14);
   * `null` wanneer het model ontbreekt of de optie onbekend is (B-410, WP-C2).
   * Callers moeten bij `null` terugvallen op het gedenormaliseerde, server-owned
   * `Finding.isCritical` — dat bevat het antwoord al. Nooit hardcoden op false:
   * dan beweert de respons "niet kritiek" over een wél-kritieke constatering.
   */
  isCritical: boolean | null;
}

export function getMainClassification(
  classificationValues: Record<string, string> | null,
  classificationModel: SeverityClassificationModel,
): MainClassification {
  if (!classificationValues || Object.keys(classificationValues).length === 0) {
    return { code: '-', name: 'Niet geclassificeerd', color: '#666666', isCritical: null };
  }
  const mainCharCode = findSeverityCharacteristicCode(classificationValues) as string;
  const code = classificationValues[mainCharCode];

  if (classificationModel) {
    const characteristic = classificationModel.characteristics.find(
      (c) => c.code === mainCharCode,
    );
    const option = characteristic?.options.find((o) => o.code === code);
    if (option) {
      return { code, name: option.name, color: option.color, isCritical: option.isCritical ?? false };
    }
  }

  // Fallback zonder (bruikbaar) model: kleur/label degraderen, maar over
  // kritikaliteit doet dit pad géén uitspraak (null — zie interface-docs).
  return { code, name: code, color: DEFAULT_SEVERITY_COLORS[code] || '#666666', isCritical: null };
}
