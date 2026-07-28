// Zod-schema voor Finding.classificationValues (Json @default("{}")).
// Vorm: Record<characteristicCode, optionCode> (bv. { SEVERITY: 'C2' }). Permissief
// object — de karakteristiek-codes zijn org-configureerbaar, dus keys/inhoud vrij.
// NB (WP-B10 · B-222): dit schema valideert alleen de VORM. De semantische check
// — bestaan de kenmerk-/optiecodes in het toepasselijke classificatiemodel? —
// zit in common/utils/classification-values.ts en draait in findings.service
// (REST) en sync.service (push/resolve), streng op nieuwe/gewijzigde waarden.
import { jsonObjectSchema } from '@/common';

export const CLASSIFICATION_VALUES_LABEL = 'classificatiewaarden';

export const classificationValuesSchema = jsonObjectSchema;
