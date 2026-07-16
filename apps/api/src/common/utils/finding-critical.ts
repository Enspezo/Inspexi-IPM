/**
 * Online herstel (PRD-14): berekening van `Finding.isCritical`.
 *
 * Een finding is kritiek zodra minstens één van zijn classificatie-waarden
 * (`classificationValues`: Record<characteristicCode, optionCode>) verwijst
 * naar een `ClassificationOption` met `isCritical: true` binnen het
 * classificatiemodel van het plan (via `InspectionPlan.inspectionTemplate`).
 *
 * Server-owned: dit veld wordt uitsluitend hier berekend (findings.service,
 * de /sync-push-mapper en het backfill-script) en is niet client-schrijfbaar.
 */

export interface ClassificationModelForCritical {
  characteristics: Array<{
    code: string;
    options: Array<{ code: string; isCritical: boolean }>;
  }>;
}

export function computeFindingIsCritical(
  classificationValues: unknown,
  model: ClassificationModelForCritical | null | undefined,
): boolean {
  if (!model || !classificationValues || typeof classificationValues !== 'object') {
    return false;
  }
  for (const [charCode, optionCode] of Object.entries(
    classificationValues as Record<string, unknown>,
  )) {
    if (typeof optionCode !== 'string') continue;
    const characteristic = model.characteristics.find((c) => c.code === charCode);
    const option = characteristic?.options.find((o) => o.code === optionCode);
    if (option?.isCritical) return true;
  }
  return false;
}
