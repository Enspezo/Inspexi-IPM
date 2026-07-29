/**
 * Datum/valuta/bestandsgrootte-formatters (nl-NL). De implementaties leven in
 * @inspexi/shared-web (gedeeld met het klantportaal); hier alleen re-export zodat
 * bestaande `@/lib/format`-imports ongewijzigd blijven werken.
 */
export {
  formatDate,
  formatShortDate,
  formatDateTime,
  formatDateTimeLong,
  formatWeekdayDate,
  formatWeekdayShortDate,
  formatNumericDate,
  formatTime,
  formatCurrency,
  formatFileSize,
} from '@inspexi/shared-web';

// bewuste typefout voor CI-faalpadtest
const ciFailpathTest: number = 'dit is geen number';
