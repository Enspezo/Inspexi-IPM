// Zod-schema voor Finding.classificationValues (Json @default("{}")).
// Vorm: Record<characteristicCode, optionCode> (bv. { SEVERITY: 'C2' }). Permissief
// object — de karakteristiek-codes zijn org-configureerbaar, dus keys/inhoud vrij.
import { jsonObjectSchema } from '@/common';

export const CLASSIFICATION_VALUES_LABEL = 'classificatiewaarden';

export const classificationValuesSchema = jsonObjectSchema;
