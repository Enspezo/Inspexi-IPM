// Zod-schema voor InspectionPlan.metadata (Json @default("{}"), non-nullable).
// Vormvrije extra plan-gegevens → permissief object; `null`/arrays/primitieven
// worden geweigerd (de kolom is niet-nullable).
import { jsonObjectSchema } from '@/common';

export const PLAN_METADATA_LABEL = 'metadata';

export const planMetadataSchema = jsonObjectSchema;
