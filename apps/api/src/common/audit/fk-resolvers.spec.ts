import { scalarSelect, displaySelect, getModelScalarFields } from './fk-resolvers';

// M7: the audit trail must fetch only the columns it needs, never whole rows. These
// tests lock the DMMF-derived select helpers: valid scalar columns are kept, unknown
// fields and relations are dropped, and sensitive columns never leak into a display
// select.
describe('audit select helpers (M7)', () => {
  describe('getModelScalarFields', () => {
    it('returns scalar columns for a known model and undefined for an unknown one', () => {
      const userFields = getModelScalarFields('User');
      expect(userFields?.has('email')).toBe(true);
      expect(userFields?.has('passwordHash')).toBe(true);
      // Relations are not scalar columns:
      expect(userFields?.has('organization')).toBe(false);
      expect(getModelScalarFields('DoesNotExist')).toBeUndefined();
    });
  });

  describe('scalarSelect', () => {
    it('always includes id and keeps only real scalar columns', () => {
      const select = scalarSelect('User', ['firstName', 'bogusField', 'organization']);
      expect(select).toEqual({ id: true, firstName: true });
    });

    it('returns undefined for an unknown model (caller falls back to full fetch)', () => {
      expect(scalarSelect('DoesNotExist', ['x'])).toBeUndefined();
    });
  });

  describe('displaySelect', () => {
    it('selects the label fields a renderer reads but never sensitive columns', () => {
      const select = displaySelect('User')!;
      expect(select.id).toBe(true);
      expect(select.firstName).toBe(true);
      expect(select.lastName).toBe(true);
      expect(select.email).toBe(true);
      // Sensitive / irrelevant columns must not be pulled:
      expect(select).not.toHaveProperty('passwordHash');
    });

    it('resolves registry displayFields (e.g. Contact.companyName)', () => {
      const select = displaySelect('Contact')!;
      expect(select.companyName).toBe(true);
      expect(select.id).toBe(true);
    });
  });
});
