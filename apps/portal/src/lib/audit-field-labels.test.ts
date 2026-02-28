import { describe, it, expect } from 'vitest';
import { getFieldLabel } from './audit-field-labels';

describe('getFieldLabel', () => {
  describe('common labels', () => {
    it('should return Dutch label for common fields', () => {
      expect(getFieldLabel('Contact', 'name')).toBe('Naam');
      expect(getFieldLabel('Contact', 'email')).toBe('E-mailadres');
      expect(getFieldLabel('Contact', 'phone')).toBe('Telefoon');
      expect(getFieldLabel('Contact', 'notes')).toBe('Notities');
      expect(getFieldLabel('Contact', 'description')).toBe('Beschrijving');
    });

    it('should return Dutch labels for address fields', () => {
      expect(getFieldLabel('Location', 'street')).toBe('Straat');
      expect(getFieldLabel('Location', 'houseNumber')).toBe('Huisnummer');
      expect(getFieldLabel('Location', 'postalCode')).toBe('Postcode');
      expect(getFieldLabel('Location', 'city')).toBe('Stad');
    });

    it('should return Dutch labels for user fields', () => {
      expect(getFieldLabel('User', 'firstName')).toBe('Voornaam');
      expect(getFieldLabel('User', 'lastName')).toBe('Achternaam');
      expect(getFieldLabel('User', 'role')).toBe('Rol');
    });
  });

  describe('entity-specific labels', () => {
    it('should return Contact-specific labels', () => {
      expect(getFieldLabel('Contact', 'companyName')).toBe('Bedrijfsnaam');
      expect(getFieldLabel('Contact', 'vatNumber')).toBe('BTW-nummer');
      expect(getFieldLabel('Contact', 'cocNumber')).toBe('KvK-nummer');
      expect(getFieldLabel('Contact', 'ownerId')).toBe('Eigenaar');
    });

    it('should return Request-specific labels', () => {
      expect(getFieldLabel('Request', 'title')).toBe('Titel');
      expect(getFieldLabel('Request', 'status')).toBe('Status');
      expect(getFieldLabel('Request', 'assignedTo')).toBe('Toegewezen aan');
      expect(getFieldLabel('Request', 'source')).toBe('Bron');
      expect(getFieldLabel('Request', 'priority')).toBe('Prioriteit');
    });

    it('should return Quote-specific labels', () => {
      expect(getFieldLabel('Quote', 'quoteNumber')).toBe('Offertenummer');
      expect(getFieldLabel('Quote', 'subject')).toBe('Onderwerp');
      expect(getFieldLabel('Quote', 'subtotal')).toBe('Subtotaal');
      expect(getFieldLabel('Quote', 'total')).toBe('Totaal');
      expect(getFieldLabel('Quote', 'validUntil')).toBe('Geldig tot');
    });

    it('should return Product-specific labels', () => {
      expect(getFieldLabel('Product', 'unit')).toBe('Eenheid');
      expect(getFieldLabel('Product', 'defaultVat')).toBe('Standaard BTW');
    });

    it('should return QuoteLine-specific labels', () => {
      expect(getFieldLabel('QuoteLine', 'quantity')).toBe('Aantal');
      expect(getFieldLabel('QuoteLine', 'unitPrice')).toBe('Stukprijs');
      expect(getFieldLabel('QuoteLine', 'lineTotal')).toBe('Regeltotaal');
    });

    it('should return Organization-specific labels', () => {
      expect(getFieldLabel('Organization', 'slug')).toBe('Slug');
      expect(getFieldLabel('Organization', 'primaryColor')).toBe('Primaire kleur');
    });

    it('should return PlanningItem-specific labels', () => {
      expect(getFieldLabel('PlanningItem', 'scheduledDate')).toBe('Datum');
      expect(getFieldLabel('PlanningItem', 'durationMinutes')).toBe('Duur (minuten)');
      expect(getFieldLabel('PlanningItem', 'productName')).toBe('Product naam');
    });
  });

  describe('fallback behavior', () => {
    it('should fall back to common labels when entity has no specific label', () => {
      expect(getFieldLabel('UnknownEntity', 'name')).toBe('Naam');
      expect(getFieldLabel('UnknownEntity', 'email')).toBe('E-mailadres');
    });

    it('should return field name as-is when no label exists', () => {
      expect(getFieldLabel('Contact', 'someUnknownField')).toBe('someUnknownField');
    });

    it('should prefer entity-specific over common labels', () => {
      // Contact has role in ContactPerson, which should take precedence
      expect(getFieldLabel('ContactPerson', 'role')).toBe('Rol');
    });
  });
});
