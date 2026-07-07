// Zod-schema's voor de JSON-kolommen van MeasurementSheetRecord.
//   - data (Json @default("{}"))         → geneste sectie/rij/veld-structuur (object)
//   - templateSnapshot (Json, verplicht) → ingevroren template-definitie (object)
//   - finalCheckResults (Json?)          → eindcontrole-resultaat { passed, results } (object, nullable)
// Alle drie vormvrij/versieafhankelijk → permissief object.
import { jsonObjectSchema } from '@/common';

export const SHEET_RECORD_DATA_LABEL = 'meetstaatgegevens';
export const TEMPLATE_SNAPSHOT_LABEL = 'template-snapshot';
export const FINAL_CHECK_RESULTS_LABEL = 'eindcontrole-resultaten';

export const sheetRecordDataSchema = jsonObjectSchema;
export const templateSnapshotSchema = jsonObjectSchema;
export const finalCheckResultsSchema = jsonObjectSchema.nullable();
