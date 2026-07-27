import { NumberingModel } from '@prisma/client';
import {
  DEFAULT_SCHEMES,
  composeNumber,
  periodKeyFor,
  randomCandidate,
  resolvePlaceholders,
  sampleContext,
  sanitizePlaceholderValue,
  schemeNeedsContext,
  typecodeResolvesEmpty,
  validateAffix,
  zeroPad,
} from './numbering.helpers';

describe('numbering.helpers', () => {
  describe('zeroPad', () => {
    it('left-pads to the requested width', () => {
      expect(zeroPad(7, 4)).toBe('0007');
      expect(zeroPad(42, 4)).toBe('0042');
      expect(zeroPad(0, 3)).toBe('000');
    });

    it('never truncates when the value is longer than digits', () => {
      expect(zeroPad(12345, 4)).toBe('12345');
      expect(zeroPad(9999999, 2)).toBe('9999999');
    });

    it('uses absolute, truncated integer value', () => {
      expect(zeroPad(-7, 4)).toBe('0007');
      expect(zeroPad(7.9, 4)).toBe('0007');
    });
  });

  describe('periodKeyFor', () => {
    const date = new Date('2026-03-09T12:00:00Z');

    it('returns empty string for CONTINUOUS', () => {
      expect(periodKeyFor('CONTINUOUS', date)).toBe('');
    });

    it('returns the calendar year for PER_YEAR', () => {
      expect(periodKeyFor('PER_YEAR', date)).toBe(String(date.getFullYear()));
    });

    it('returns year-month (1-based, zero-padded) for PER_MONTH', () => {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const expected = `${date.getFullYear()}-${mm}`;
      expect(periodKeyFor('PER_MONTH', date)).toBe(expected);
      // March → month index 2 in JS, but the helper formats the calendar month "03".
      expect(periodKeyFor('PER_MONTH', date)).toMatch(/^\d{4}-\d{2}$/);
    });

    it('zero-pads single-digit months', () => {
      const jan = new Date('2026-01-15T12:00:00Z');
      const mm = String(jan.getMonth() + 1).padStart(2, '0');
      expect(periodKeyFor('PER_MONTH', jan)).toBe(`${jan.getFullYear()}-${mm}`);
    });
  });

  describe('sanitizePlaceholderValue', () => {
    it('uppercases and strips spaces', () => {
      expect(sanitizePlaceholderValue('1234 AB')).toBe('1234AB');
    });

    it('strips punctuation', () => {
      expect(sanitizePlaceholderValue('ACME B.V.')).toBe('ACMEBV');
    });

    it('strips diacritics', () => {
      expect(sanitizePlaceholderValue('Café')).toBe('CAFE');
    });

    it('returns empty string for null/undefined/empty', () => {
      expect(sanitizePlaceholderValue(null)).toBe('');
      expect(sanitizePlaceholderValue(undefined)).toBe('');
      expect(sanitizePlaceholderValue('')).toBe('');
    });
  });

  describe('resolvePlaceholders', () => {
    it('replaces known tokens', () => {
      expect(
        resolvePlaceholders('OFF-[jaar]-[maand]', { jaar: '2026', maand: '03' }),
      ).toBe('OFF-2026-03');
    });

    it('is case-insensitive on the token name', () => {
      expect(resolvePlaceholders('[JAAR]', { jaar: '2026' })).toBe('2026');
    });

    it('collapses unknown tokens to empty string', () => {
      expect(resolvePlaceholders('A-[onbekend]-B', { jaar: '2026' })).toBe('A--B');
    });

    it('leaves literal text untouched', () => {
      expect(resolvePlaceholders('PRD-', {})).toBe('PRD-');
    });
  });

  describe('composeNumber', () => {
    it('composes prefix + zero-padded value + suffix with a date placeholder', () => {
      const scheme = {
        model: 'QUOTE' as NumberingModel,
        prefix: 'OFF-[jaar]-',
        suffix: '',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 7, {}, date)).toBe(
        `OFF-${date.getFullYear()}-0007`,
      );
    });

    it('resolves and sanitizes a [postcode] placeholder from context', () => {
      const scheme = {
        model: 'QUOTE' as NumberingModel,
        prefix: '[postcode]-',
        suffix: '',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 12, { postcode: '1234 AB' }, date)).toBe(
        '1234AB-0012',
      );
    });

    it('resolves and sanitizes a [typecode] placeholder from typeShortCode', () => {
      const scheme = {
        model: 'ASSET_NODE' as NumberingModel,
        prefix: '[typecode]-',
        suffix: '',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 1, { typeShortCode: 'verd' }, date)).toBe('VERD-0001');
    });

    it('collapses [typecode] to empty when the type has no shortcode', () => {
      const scheme = {
        model: 'ASSET_NODE' as NumberingModel,
        prefix: '[typecode]-',
        suffix: '',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 3, { typeShortCode: null }, date)).toBe('-0003');
    });

    it('supports a suffix', () => {
      const scheme = {
        model: 'PRODUCT' as NumberingModel,
        prefix: 'PRD-',
        suffix: '-EU',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 5, {}, date)).toBe('PRD-0005-EU');
    });

    it('does not truncate a value wider than digits', () => {
      const scheme = {
        model: 'PRODUCT' as NumberingModel,
        prefix: 'PRD-',
        suffix: '',
        digits: 4,
      };
      const date = new Date('2026-06-22T12:00:00Z');
      expect(composeNumber(scheme, 123456, {}, date)).toBe('PRD-123456');
    });
  });

  describe('validateAffix', () => {
    it('accepts a valid affix with an allowed placeholder', () => {
      expect(validateAffix('OFF-[jaar]-', 'QUOTE', 'Prefix')).toEqual({
        valid: true,
      });
    });

    it('accepts a plain literal affix', () => {
      expect(validateAffix('PRD-', 'PRODUCT', 'Prefix')).toEqual({ valid: true });
    });

    it('rejects a placeholder not allowed for the model ([groep] on QUOTE)', () => {
      const result = validateAffix('[groep]-', 'QUOTE', 'Prefix');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[groep]');
      expect(result.error).toContain('niet toegestaan');
    });

    it('rejects a placeholder not allowed for the model ([postcode] on PRODUCT)', () => {
      const result = validateAffix('[postcode]-', 'PRODUCT', 'Prefix');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[postcode]');
    });

    it('accepts [typecode] on ASSET_NODE / LOCATION_NODE', () => {
      expect(validateAffix('[typecode]-', 'ASSET_NODE', 'Prefix')).toEqual({ valid: true });
      expect(validateAffix('[typecode]-', 'LOCATION_NODE', 'Prefix')).toEqual({ valid: true });
    });

    it('rejects [typecode] on a non-node model (QUOTE)', () => {
      const result = validateAffix('[typecode]-', 'QUOTE', 'Prefix');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[typecode]');
    });

    it('rejects a literal space', () => {
      const result = validateAffix('OFF -', 'QUOTE', 'Prefix');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Prefix');
    });

    it('rejects an illegal character (#)', () => {
      const result = validateAffix('OFF#', 'QUOTE', 'Prefix');
      expect(result.valid).toBe(false);
    });

    it('rejects an over-length affix', () => {
      const result = validateAffix('A'.repeat(41), 'QUOTE', 'Prefix');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximaal');
    });
  });

  describe('schemeNeedsContext', () => {
    it('is true when a [postcode] token is present', () => {
      expect(schemeNeedsContext('[postcode]-', '')).toBe(true);
    });

    it('is true when a [contact] token is present', () => {
      expect(schemeNeedsContext('', '[contact]')).toBe(true);
    });

    it('is true when a [groep] token is present', () => {
      expect(schemeNeedsContext('PRD-[groep]', '')).toBe(true);
    });

    it('is true when a [typecode] token is present', () => {
      expect(schemeNeedsContext('[typecode]-', '')).toBe(true);
    });

    it('is false for only [jaar]/literal text', () => {
      expect(schemeNeedsContext('OFF-[jaar]-', '')).toBe(false);
      expect(schemeNeedsContext('PRD-', '')).toBe(false);
    });
  });

  // WP-C3 (B-203): detectie van een leeg-resolvende [typecode] — de service
  // weigert de generatie dan i.p.v. een misvormd `-0033`-nummer te componeren.
  describe('typecodeResolvesEmpty', () => {
    it('is true when the scheme uses [typecode] and the shortcode is missing/empty', () => {
      expect(typecodeResolvesEmpty({ prefix: '[typecode]-', suffix: '' }, {})).toBe(true);
      expect(
        typecodeResolvesEmpty({ prefix: '[typecode]-', suffix: '' }, { typeShortCode: null }),
      ).toBe(true);
      expect(
        typecodeResolvesEmpty({ prefix: '[typecode]-', suffix: '' }, { typeShortCode: '––' }),
      ).toBe(true); // sanitize strips alles niet-alfanumeriek → leeg
    });

    it('is false when the shortcode resolves to a real token', () => {
      expect(
        typecodeResolvesEmpty({ prefix: '[typecode]-', suffix: '' }, { typeShortCode: 'EI' }),
      ).toBe(false);
    });

    it('is false when the scheme does not use [typecode] at all', () => {
      expect(typecodeResolvesEmpty({ prefix: 'LOC-', suffix: '' }, {})).toBe(false);
      expect(typecodeResolvesEmpty({ prefix: 'A-', suffix: '' }, { typeShortCode: null })).toBe(false);
    });
  });

  describe('randomCandidate', () => {
    it('returns an integer within [0, 10^digits) across several rolls', () => {
      const digits = 4;
      const span = Math.pow(10, digits);
      for (let i = 0; i < 50; i++) {
        const value = randomCandidate(digits);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(span);
      }
    });
  });

  describe('DEFAULT_SCHEMES', () => {
    it('has all numbering models', () => {
      expect(Object.keys(DEFAULT_SCHEMES).sort()).toEqual(
        ['ASSET_NODE', 'LOCATION_NODE', 'PRODUCT', 'PROJECT', 'QUOTE', 'REQUEST', 'WORK_ORDER'].sort(),
      );
    });

    it('WORK_ORDER uses WB-[jaar]- prefix with PER_YEAR reset', () => {
      expect(DEFAULT_SCHEMES.WORK_ORDER.prefix).toBe('WB-[jaar]-');
      expect(DEFAULT_SCHEMES.WORK_ORDER.resetPolicy).toBe('PER_YEAR');
    });

    it('QUOTE uses OFF-[jaar]- prefix with PER_YEAR reset', () => {
      expect(DEFAULT_SCHEMES.QUOTE.prefix).toBe('OFF-[jaar]-');
      expect(DEFAULT_SCHEMES.QUOTE.resetPolicy).toBe('PER_YEAR');
    });

    it('PRODUCT uses a CONTINUOUS reset policy', () => {
      expect(DEFAULT_SCHEMES.PRODUCT.resetPolicy).toBe('CONTINUOUS');
    });

    it('ASSET_NODE uses the [typecode]- prefix with a CONTINUOUS reset', () => {
      expect(DEFAULT_SCHEMES.ASSET_NODE.prefix).toBe('[typecode]-');
      expect(DEFAULT_SCHEMES.ASSET_NODE.resetPolicy).toBe('CONTINUOUS');
    });

    it('LOCATION_NODE uses the LOC- prefix with a CONTINUOUS reset', () => {
      expect(DEFAULT_SCHEMES.LOCATION_NODE.prefix).toBe('LOC-');
      expect(DEFAULT_SCHEMES.LOCATION_NODE.resetPolicy).toBe('CONTINUOUS');
    });
  });

  describe('sampleContext', () => {
    it('provides a typeShortCode sample for the node models', () => {
      expect(sampleContext('ASSET_NODE').typeShortCode).toBeTruthy();
      expect(sampleContext('LOCATION_NODE').typeShortCode).toBeTruthy();
    });
  });
});
