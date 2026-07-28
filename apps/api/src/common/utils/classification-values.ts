/**
 * WP-B10 (B-222): semantische validatie van `Finding.classificationValues`
 * tegen de toepasselijke classificatiemodellen.
 *
 * Vóór deze fix accepteerde de server elke JSON-vorm (`classificationValuesSchema`
 * is bewust permissief); fictief vocabulaire zoals `{"risico":"kritiek"}` werd
 * stil gepersisteerd, matchte nooit een `ClassificationOption` en liet de hele
 * PRD-14-keten (isCritical → online herstel → HERINSPECTIE_VOORSTEL) dood.
 *
 * Fasering (coördinatie-eis herstelplan WP-B10):
 *  - NIEUWE records (create) en records waarvan de classificatie daadwerkelijk
 *    WIJZIGT → streng: onbekende kenmerk-/optiecodes geven een NL-fout.
 *  - Een ongewijzigde echo van bestaande (legacy-)waarden bij een update blijft
 *    werken — de PWA stuurt het volledige record bij elke push en oude records
 *    met legacy-vocabulaire mogen niet permanent vast komen te zitten. De
 *    aanroeper logt die echo's (tolerant-loggend), zie sync.service /
 *    findings.service.
 *  - Zonder bruikbaar model (geen template-model én geen normtype-default) valt
 *    er niets te valideren → geen fout (er bestaat dan geen vocabulaire; de
 *    finding kan ook nooit kritiek zijn).
 */

import { BadRequestException } from '@nestjs/common';
import type { ClassificationModelForCritical } from './finding-critical';

export type ClassificationValueIssue =
  | { reason: 'invalid_value'; characteristicCode: string }
  | { reason: 'unknown_characteristic'; characteristicCode: string }
  | { reason: 'unknown_option'; characteristicCode: string; optionCode: string };

/** Modellen met minstens één kenmerk — alleen daartegen valt te valideren. */
function usableModels(
  models: Array<ClassificationModelForCritical | null | undefined>,
): ClassificationModelForCritical[] {
  return models.filter(
    (m): m is ClassificationModelForCritical =>
      !!m && m.characteristics.length > 0,
  );
}

/**
 * Zoek alle ongeldige entries in `classificationValues`. Een entry
 * (kenmerkcode → optiecode) is geldig wanneer minstens één toepasselijk model
 * dat kenmerk mét die optie kent (kenmerk en optie in hetzélfde model).
 * Lege waarden (`{}`) en niet-object-vormen leveren geen issues op — de
 * vorm-validatie zit in de Zod-laag (classification-values.schema).
 */
export function findClassificationValueIssues(
  classificationValues: unknown,
  models: Array<ClassificationModelForCritical | null | undefined>,
): ClassificationValueIssue[] {
  if (
    !classificationValues ||
    typeof classificationValues !== 'object' ||
    Array.isArray(classificationValues)
  ) {
    return [];
  }
  const usable = usableModels(models);
  if (usable.length === 0) return [];

  const issues: ClassificationValueIssue[] = [];
  for (const [charCode, optionCode] of Object.entries(
    classificationValues as Record<string, unknown>,
  )) {
    if (typeof optionCode !== 'string' || optionCode === '') {
      issues.push({ reason: 'invalid_value', characteristicCode: charCode });
      continue;
    }
    const withCharacteristic = usable.filter((m) =>
      m.characteristics.some((c) => c.code === charCode),
    );
    if (withCharacteristic.length === 0) {
      issues.push({ reason: 'unknown_characteristic', characteristicCode: charCode });
      continue;
    }
    const optionKnown = withCharacteristic.some((m) =>
      m.characteristics.some(
        (c) => c.code === charCode && c.options.some((o) => o.code === optionCode),
      ),
    );
    if (!optionKnown) {
      issues.push({ reason: 'unknown_option', characteristicCode: charCode, optionCode });
    }
  }
  return issues;
}

/** NL-samenvatting van de gevonden issues (voor foutmelding én tolerant-log). */
export function formatClassificationValueIssues(
  issues: ClassificationValueIssue[],
): string {
  return issues
    .map((issue) => {
      switch (issue.reason) {
        case 'unknown_characteristic':
          return `kenmerk '${issue.characteristicCode}' bestaat niet in het classificatiemodel`;
        case 'unknown_option':
          return `optie '${issue.optionCode}' is onbekend voor kenmerk '${issue.characteristicCode}'`;
        case 'invalid_value':
          return `waarde voor kenmerk '${issue.characteristicCode}' is ongeldig`;
      }
    })
    .join('; ');
}

/**
 * Strenge poort: gooi een NL-`BadRequestException` zodra `classificationValues`
 * codes bevat die niet in de toepasselijke modellen bestaan. Gebruik alleen op
 * nieuwe records of daadwerkelijk gewijzigde classificaties (zie fasering).
 */
export function assertClassificationValuesKnown(
  classificationValues: unknown,
  models: Array<ClassificationModelForCritical | null | undefined>,
): void {
  const issues = findClassificationValueIssues(classificationValues, models);
  if (issues.length === 0) return;
  throw new BadRequestException(
    `Classificatie ongeldig: ${formatClassificationValueIssues(issues)}. ` +
      'Kies een classificatie uit het geconfigureerde classificatiemodel (synchroniseer de app voor de actuele modellen)',
  );
}
