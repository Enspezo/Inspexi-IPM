import { describe, it, expect } from 'vitest';
import {
  ENTITY_TYPE_LABELS,
  getEntityTypeLabel,
  getEntityLink,
  getEntityDisplayName,
} from './audit-entity-helpers';

describe('ENTITY_TYPE_LABELS', () => {
  it('should have Dutch labels for all known entity types', () => {
    expect(ENTITY_TYPE_LABELS.Contact).toBe('Relatie');
    expect(ENTITY_TYPE_LABELS.ContactPerson).toBe('Contactpersoon');
    expect(ENTITY_TYPE_LABELS.Location).toBe('Locatie');
    expect(ENTITY_TYPE_LABELS.CustomerGroup).toBe('Klantgroep');
    expect(ENTITY_TYPE_LABELS.Product).toBe('Product');
    expect(ENTITY_TYPE_LABELS.PriceTable).toBe('Prijstabel');
    expect(ENTITY_TYPE_LABELS.Request).toBe('Aanvraag');
    expect(ENTITY_TYPE_LABELS.Quote).toBe('Offerte');
    expect(ENTITY_TYPE_LABELS.QuoteLine).toBe('Offerteregel');
    expect(ENTITY_TYPE_LABELS.QuoteTemplate).toBe('Offertesjabloon');
    expect(ENTITY_TYPE_LABELS.User).toBe('Gebruiker');
    expect(ENTITY_TYPE_LABELS.Organization).toBe('Organisatie');
  });
});

describe('getEntityTypeLabel', () => {
  it('should return Dutch label for known entity type', () => {
    expect(getEntityTypeLabel('Contact')).toBe('Relatie');
    expect(getEntityTypeLabel('Request')).toBe('Aanvraag');
  });

  it('should return the entity type name as fallback for unknown types', () => {
    expect(getEntityTypeLabel('UnknownType')).toBe('UnknownType');
  });
});

describe('getEntityLink', () => {
  it('should return correct URL for Contact', () => {
    expect(getEntityLink('Contact', 'c-1')).toBe('/contacts/c-1');
  });

  it('should return correct URL for ContactPerson', () => {
    expect(getEntityLink('ContactPerson', 'cp-1')).toBe('/contacts/persons/cp-1');
  });

  it('should return the dedicated location detail URL for Location', () => {
    expect(getEntityLink('Location', 'loc-1')).toBe('/contacts/locations/loc-1');
  });

  it('should link Location to its detail page regardless of snapshot', () => {
    expect(getEntityLink('Location', 'loc-1', { contactId: 'c-1' })).toBe(
      '/contacts/locations/loc-1',
    );
  });

  it('should return correct URL for Request', () => {
    expect(getEntityLink('Request', 'req-1')).toBe('/requests/req-1');
  });

  it('should return correct URL for Quote', () => {
    expect(getEntityLink('Quote', 'q-1')).toBe('/quotes/q-1');
  });

  it('should return parent quote URL for QuoteLine with snapshot', () => {
    expect(getEntityLink('QuoteLine', 'ql-1', { quoteId: 'q-1' })).toBe('/quotes/q-1');
  });

  it('should return correct URL for Product', () => {
    expect(getEntityLink('Product', 'p-1')).toBe('/products/p-1');
  });

  it('should return correct URL for PriceTable', () => {
    expect(getEntityLink('PriceTable', 'pt-1')).toBe('/price-tables/pt-1');
  });

  it('should return parent price table URL for PriceTableItem', () => {
    expect(getEntityLink('PriceTableItem', 'pti-1', { priceTableId: 'pt-1' })).toBe(
      '/price-tables/pt-1',
    );
  });

  it('should return detail URL for QuoteTemplate', () => {
    expect(getEntityLink('QuoteTemplate', 'qt-1')).toBe('/quote-templates/qt-1');
  });

  it('should return detail URL for User', () => {
    expect(getEntityLink('User', 'u-1')).toBe('/users/u-1');
  });

  it('should return correct URL for Organization', () => {
    expect(getEntityLink('Organization', 'org-1')).toBe('/organizations/org-1');
  });

  it('should return null for unknown entity type', () => {
    expect(getEntityLink('Unknown', 'id-1')).toBeNull();
  });
});

describe('getEntityDisplayName', () => {
  it('should return company name for Contact', () => {
    expect(getEntityDisplayName('Contact', { companyName: 'ACME Corp' })).toBe('ACME Corp');
  });

  it('should return full name for Contact without company name', () => {
    expect(getEntityDisplayName('Contact', { firstName: 'Jan', lastName: 'Jansen' })).toBe(
      'Jan Jansen',
    );
  });

  it('should return "Relatie" for Contact with no name fields', () => {
    expect(getEntityDisplayName('Contact', {})).toBe('Relatie');
  });

  it('should return full name for ContactPerson', () => {
    expect(
      getEntityDisplayName('ContactPerson', { firstName: 'Piet', lastName: 'de Vries' }),
    ).toBe('Piet de Vries');
  });

  it('should return address for Location', () => {
    expect(
      getEntityDisplayName('Location', {
        street: 'Kerkstraat',
        houseNumber: '1',
        city: 'Amsterdam',
      }),
    ).toBe('Kerkstraat 1 Amsterdam');
  });

  it('should return name for Product', () => {
    expect(getEntityDisplayName('Product', { name: 'Inspectie A' })).toBe('Inspectie A');
  });

  it('should return quoteNumber for Quote', () => {
    expect(getEntityDisplayName('Quote', { quoteNumber: 'OFF-2025-001' })).toBe('OFF-2025-001');
  });

  it('should return title for Request', () => {
    expect(getEntityDisplayName('Request', { title: 'Nieuwe aanvraag' })).toBe('Nieuwe aanvraag');
  });

  it('should return user name for User', () => {
    expect(
      getEntityDisplayName('User', { firstName: 'Admin', lastName: 'User', email: 'a@b.nl' }),
    ).toBe('Admin User');
  });

  it('should return email for User without name', () => {
    expect(getEntityDisplayName('User', { email: 'admin@test.nl' })).toBe('admin@test.nl');
  });

  it('should return entity type label for null snapshot', () => {
    expect(getEntityDisplayName('Contact', null)).toBe('Relatie');
    expect(getEntityDisplayName('Request', null)).toBe('Aanvraag');
  });

  it('should return entity type label for unknown types', () => {
    expect(getEntityDisplayName('UnknownType', { foo: 'bar' })).toBe('UnknownType');
  });
});
