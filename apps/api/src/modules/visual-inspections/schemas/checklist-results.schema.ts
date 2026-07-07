// Zod-schema voor VisualInspection.checklistResults (Json @default("[]")).
// Vorm: array van checklist-item-resultaten (bv. { itemCode, label, result }). De
// item-vorm is checklist-afhankelijk, dus we borgen alleen dat het een array is.
import { jsonArraySchema } from '@/common';

export const CHECKLIST_RESULTS_LABEL = 'checklist-resultaten';

export const checklistResultsSchema = jsonArraySchema;
