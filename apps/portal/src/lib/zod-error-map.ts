import { z } from 'zod';

/**
 * Globale Nederlandse zod-errorMap (WP-C1 / B-501).
 *
 * Vertaalt de Engelse zod-defaults ("Number must be greater than or equal
 * to 0") naar Nederlandse meldingen. Expliciete `message`-opties op schema's
 * (bv. "Naam moet minimaal 2 tekens bevatten") blijven altijd leidend — zod
 * raadpleegt de errorMap alleen wanneer er géén eigen message is opgegeven.
 *
 * Activeren via `z.setErrorMap(nlErrorMap)` in `main.tsx`, vóór de eerste
 * render (de schema's evalueren hun messages pas bij validatie).
 */
export const nlErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Dit veld is verplicht' };
      }
      if (issue.expected === 'number') return { message: 'Voer een geldig getal in' };
      if (issue.expected === 'string') return { message: 'Voer een tekstwaarde in' };
      if (issue.expected === 'date') return { message: 'Voer een geldige datum in' };
      return { message: 'Ongeldige waarde' };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Voer een geldig e-mailadres in' };
      if (issue.validation === 'url') return { message: 'Voer een geldige URL in' };
      if (issue.validation === 'uuid') return { message: 'Ongeldige identificatie' };
      if (issue.validation === 'regex') return { message: 'Ongeldig formaat' };
      return { message: 'Ongeldige tekstwaarde' };
    case z.ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      if (issue.type === 'number' || issue.type === 'bigint') {
        return {
          message: issue.inclusive
            ? `Waarde moet minimaal ${min} zijn`
            : `Waarde moet groter zijn dan ${min}`,
        };
      }
      if (issue.type === 'string') {
        return min === 1
          ? { message: 'Dit veld is verplicht' }
          : { message: `Voer minimaal ${min} tekens in` };
      }
      if (issue.type === 'array') {
        return min === 1
          ? { message: 'Selecteer minimaal 1 item' }
          : { message: `Selecteer minimaal ${min} items` };
      }
      if (issue.type === 'date') return { message: 'Datum ligt te ver in het verleden' };
      return { message: 'Waarde is te klein' };
    }
    case z.ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      if (issue.type === 'number' || issue.type === 'bigint') {
        return {
          message: issue.inclusive
            ? `Waarde mag maximaal ${max} zijn`
            : `Waarde moet kleiner zijn dan ${max}`,
        };
      }
      if (issue.type === 'string') return { message: `Voer maximaal ${max} tekens in` };
      if (issue.type === 'array') return { message: `Selecteer maximaal ${max} items` };
      if (issue.type === 'date') return { message: 'Datum ligt te ver in de toekomst' };
      return { message: 'Waarde is te groot' };
    }
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Maak een keuze uit de lijst' };
    case z.ZodIssueCode.invalid_date:
      return { message: 'Voer een geldige datum in' };
    case z.ZodIssueCode.not_multiple_of:
      return { message: `Waarde moet een veelvoud van ${issue.multipleOf} zijn` };
    case z.ZodIssueCode.custom:
      // Custom refinements zonder eigen message
      return { message: issue.params?.message ?? 'Ongeldige waarde' };
    default:
      return { message: ctx.defaultError };
  }
};
