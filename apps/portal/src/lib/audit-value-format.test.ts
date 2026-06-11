import { describe, it, expect } from 'vitest';
import { formatAuditValue, isHiddenAuditField } from './audit-value-format';

describe('formatAuditValue', () => {
  describe('null/undefined handling', () => {
    it('should return "(leeg)" for null', () => {
      expect(formatAuditValue(null)).toBe('(leeg)');
    });

    it('should return "(leeg)" for undefined', () => {
      expect(formatAuditValue(undefined)).toBe('(leeg)');
    });
  });

  describe('boolean formatting', () => {
    it('should return "Ja" for true', () => {
      expect(formatAuditValue(true)).toBe('Ja');
    });

    it('should return "Nee" for false', () => {
      expect(formatAuditValue(false)).toBe('Nee');
    });
  });

  describe('enum labels', () => {
    it('should format ContactType COMPANY', () => {
      expect(formatAuditValue('COMPANY')).toBe('Bedrijf');
    });

    it('should format ContactType INDIVIDUAL', () => {
      expect(formatAuditValue('INDIVIDUAL')).toBe('Particulier');
    });

    it('should format RequestStatus', () => {
      expect(formatAuditValue('NIEUW')).toBe('Nieuw');
      expect(formatAuditValue('IN_BEHANDELING')).toBe('In behandeling');
      expect(formatAuditValue('OFFERTE_GEMAAKT')).toBe('Offerte gemaakt');
      expect(formatAuditValue('GEWONNEN')).toBe('Gewonnen');
      expect(formatAuditValue('VERLOREN')).toBe('Verloren');
    });

    it('should format QuoteStatus', () => {
      expect(formatAuditValue('CONCEPT')).toBe('Concept');
      expect(formatAuditValue('VERSTUURD')).toBe('Verstuurd');
      expect(formatAuditValue('GEACCEPTEERD')).toBe('Geaccepteerd');
      expect(formatAuditValue('VERLOPEN')).toBe('Verlopen');
    });

    it('should format Role', () => {
      expect(formatAuditValue('SUPERUSER')).toBe('Superuser');
      expect(formatAuditValue('ORG_ADMIN')).toBe('Organisatie Admin');
      expect(formatAuditValue('INSPECTEUR')).toBe('Inspecteur');
    });

    it('should format PriceType', () => {
      expect(formatAuditValue('FIXED')).toBe('Vast');
      expect(formatAuditValue('TIERED')).toBe('Gestaffeld');
    });

    it('should format Priority', () => {
      expect(formatAuditValue('LOW')).toBe('Laag');
      expect(formatAuditValue('NORMAL')).toBe('Normaal');
      expect(formatAuditValue('HIGH')).toBe('Hoog');
    });
  });

  describe('UUID handling', () => {
    it('should show "(verwijderd)" for UUIDs in FK fields', () => {
      const uuid = '12345678-1234-1234-1234-123456789abc';
      expect(formatAuditValue(uuid, 'contactId')).toBe('(verwijderd)');
    });

    it('should show "(verwijderd)" for any UUID even without field context', () => {
      const uuid = 'abcdef12-abcd-abcd-abcd-abcdef123456';
      expect(formatAuditValue(uuid)).toBe('(verwijderd)');
    });

    it('should NOT show fallback for non-UUID strings', () => {
      expect(formatAuditValue('just a string')).toBe('just a string');
    });

    it('should return resolved display name if not a UUID', () => {
      expect(formatAuditValue('ACME Corp', 'contactId')).toBe('ACME Corp');
      expect(formatAuditValue('Some Company Name', 'ownerId')).toBe('Some Company Name');
    });
  });

  describe('currency formatting', () => {
    it('should format currency fields as EUR', () => {
      const result = formatAuditValue(1234.56, 'total');
      // Dutch locale EUR formatting
      expect(result).toContain('1.234,56');
    });

    it('should format zero as currency', () => {
      const result = formatAuditValue(0, 'subtotal');
      expect(result).toContain('0,00');
    });
  });

  describe('date formatting', () => {
    it('should format known date fields', () => {
      const result = formatAuditValue('2025-06-15T10:30:00Z', 'validUntil');
      // Should contain formatted date
      expect(result).not.toBe('2025-06-15T10:30:00Z');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should format ISO date strings', () => {
      const result = formatAuditValue('2025-03-01T00:00:00.000Z');
      expect(result).not.toBe('2025-03-01T00:00:00.000Z');
    });
  });

  describe('number formatting', () => {
    it('should return number as string for non-currency fields', () => {
      expect(formatAuditValue(42)).toBe('42');
    });

    it('should return number as string without field', () => {
      expect(formatAuditValue(0)).toBe('0');
    });
  });

  describe('object formatting', () => {
    it('should JSON.stringify objects', () => {
      const result = formatAuditValue({ key: 'value' });
      expect(result).toBe('{"key":"value"}');
    });
  });

  describe('plain strings', () => {
    it('should return regular strings as-is', () => {
      expect(formatAuditValue('Hello World')).toBe('Hello World');
    });

    it('should return empty string as-is', () => {
      expect(formatAuditValue('')).toBe('');
    });
  });
});

describe('isHiddenAuditField', () => {
  it('should hide "id" field', () => {
    expect(isHiddenAuditField('id')).toBe(true);
  });

  it('should hide "orgId" field', () => {
    expect(isHiddenAuditField('orgId')).toBe(true);
  });

  it('should not hide regular fields', () => {
    expect(isHiddenAuditField('companyName')).toBe(false);
    expect(isHiddenAuditField('email')).toBe(false);
    expect(isHiddenAuditField('status')).toBe(false);
  });
});
