// Zod-schema's voor de JSON-kolommen van MeasurementSheetRecord.
//   - data (Json @default("{}"))         → CANONIEKE sectie/rij/veld-structuur (zie hieronder)
//   - templateSnapshot (Json, verplicht) → ingevroren template-definitie (object)
//   - finalCheckResults (Json?)          → eindcontrole-resultaat { passed, results } (object, nullable)
//
// WP-D2 (B-205 deel 2, besluit A2): `data` is niet langer vormvrij. De canonieke
// (server)vorm is vastgelegd én afgedwongen op REST-update en de /sync-push:
//
//   {
//     [sectionCode: string]: {            // sectie uit de template(-snapshot)
//       [rowIndex: string]: {             // rij-sleutel: uitsluitend cijfers ("0", "1", …)
//         [fieldCode: string]: {          // veld uit de sectie
//           value: unknown;               // ingevulde waarde (verplicht aanwezig, mag null zijn)
//           passFail?: 'pass'|'fail'|null // uitkomst pass/fail-evaluatie
//         }
//       }
//     },
//     __usedInstrumentsSnapshot?: Array<…> // server-owned metadata (meetmiddelen-snapshot)
//   }
//
// Niet-herhalende secties zijn gewoon rij "0". Top-level sleutels met een
// `__`-prefix zijn gereserveerde metadata (server-owned) en worden niet als
// sectie gevalideerd. De verouderde PWA-vorm (`{ sections: { [code]:
// { rows: [...] } | { values: {...} } } }`) wordt expliciet afgewezen met een
// gerichte melding; bestaande rijen in die vorm zijn gemigreerd
// (migratie `canonicalize_sheet_record_data`), de PWA schrijft sinds Dexie v18
// zelf de canonieke vorm.
import { z } from 'zod';
import { jsonObjectSchema } from '@/common';

export const SHEET_RECORD_DATA_LABEL = 'meetstaatgegevens';
export const TEMPLATE_SNAPSHOT_LABEL = 'template-snapshot';
export const FINAL_CHECK_RESULTS_LABEL = 'eindcontrole-resultaten';

const ROW_INDEX_RE = /^\d+$/;
const PASS_FAIL_VALUES = new Set(['pass', 'fail']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Handgeschreven walker i.p.v. genest z.record: zo geven we per niveau een
 * gerichte Nederlandse melding (validateJsonColumn toont issue[0].message).
 */
function validateCanonicalRecordData(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  // Verouderde PWA-wrapper expliciet benoemen — dit was precies de B-205-divergentie.
  if (isPlainObject(data.sections)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "heeft de verouderde app-vorm ('sections'-wrapper); werk de app bij zodat deze de canonieke vorm schrijft",
    });
    return;
  }

  for (const [sectionCode, sectionValue] of Object.entries(data)) {
    // Gereserveerde metadata-namespace (bv. __usedInstrumentsSnapshot): server-owned,
    // vormvrij — geen sectie-validatie.
    if (sectionCode.startsWith('__')) continue;

    if (!isPlainObject(sectionValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sectie '${sectionCode}' moet een object met rijen zijn`,
      });
      return;
    }

    for (const [rowIndex, rowValue] of Object.entries(sectionValue)) {
      if (!ROW_INDEX_RE.test(rowIndex)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `sectie '${sectionCode}': rij-sleutel '${rowIndex}' is geen rijnummer`,
        });
        return;
      }
      if (!isPlainObject(rowValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `sectie '${sectionCode}', rij ${rowIndex}: rij moet een object met velden zijn`,
        });
        return;
      }

      for (const [fieldCode, fieldValue] of Object.entries(rowValue)) {
        if (!isPlainObject(fieldValue) || !('value' in fieldValue)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `sectie '${sectionCode}', rij ${rowIndex}, veld '${fieldCode}': waarde moet een { value, passFail? }-object zijn`,
          });
          return;
        }
        const passFail = fieldValue.passFail;
        if (
          passFail !== undefined &&
          passFail !== null &&
          !(typeof passFail === 'string' && PASS_FAIL_VALUES.has(passFail))
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `sectie '${sectionCode}', rij ${rowIndex}, veld '${fieldCode}': passFail moet 'pass', 'fail' of null zijn`,
          });
          return;
        }
      }
    }
  }
}

export const sheetRecordDataSchema = jsonObjectSchema.superRefine(
  validateCanonicalRecordData,
);

// Snapshot en eindcontrole blijven versieafhankelijk/vormvrij → permissief object.
export const templateSnapshotSchema = jsonObjectSchema;
export const finalCheckResultsSchema = jsonObjectSchema.nullable();
