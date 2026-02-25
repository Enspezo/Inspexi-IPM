/**
 * Shared helpers for the activity timeline / audit log UI.
 * Maps entityType → Dutch label, URL, and display name from snapshot.
 */

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Contact: 'Relatie',
  ContactPerson: 'Contactpersoon',
  Location: 'Locatie',
  CustomerGroup: 'Klantgroep',
  Product: 'Product',
  PriceTable: 'Prijstabel',
  PriceTableItem: 'Prijstabelregel',
  Request: 'Aanvraag',
  Quote: 'Offerte',
  QuoteLine: 'Offerteregel',
  QuoteTemplate: 'Sjabloon',
  User: 'Gebruiker',
  Organization: 'Organisatie',
};

/** Returns the Dutch display label for an entity type. */
export function getEntityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

/** Returns a navigable URL for a given entity, or null if no detail page exists. */
export function getEntityLink(
  entityType: string,
  entityId: string,
  snapshot?: Record<string, any> | null,
): string | null {
  switch (entityType) {
    case 'Contact':
      return `/contacts/${entityId}`;
    case 'ContactPerson':
      return `/contacts/persons/${entityId}`;
    case 'Location':
      // Location has no dedicated page; link to its parent contact if known
      return snapshot?.contactId ? `/contacts/${snapshot.contactId}` : null;
    case 'CustomerGroup':
      return `/contacts/groups/${entityId}`;
    case 'Product':
      return `/products/${entityId}`;
    case 'PriceTable':
      return `/price-tables/${entityId}`;
    case 'PriceTableItem':
      return snapshot?.priceTableId ? `/price-tables/${snapshot.priceTableId}` : null;
    case 'Request':
      return `/requests/${entityId}`;
    case 'Quote':
      return `/quotes/${entityId}`;
    case 'QuoteLine':
      return snapshot?.quoteId ? `/quotes/${snapshot.quoteId}` : null;
    case 'QuoteTemplate':
      return `/quote-templates`;
    case 'User':
      return `/users`;
    case 'Organization':
      return `/organizations/${entityId}`;
    default:
      return null;
  }
}

/** Returns a human-readable name for an entity from its snapshot. */
export function getEntityDisplayName(
  entityType: string,
  snapshot: Record<string, any> | null,
): string {
  if (!snapshot) return getEntityTypeLabel(entityType);
  switch (entityType) {
    case 'Contact':
      return (
        snapshot.companyName ||
        `${snapshot.firstName ?? ''} ${snapshot.lastName ?? ''}`.trim() ||
        'Relatie'
      );
    case 'ContactPerson':
      return `${snapshot.firstName ?? ''} ${snapshot.lastName ?? ''}`.trim() || 'Contactpersoon';
    case 'Location':
      return (
        [snapshot.street, snapshot.houseNumber, snapshot.city].filter(Boolean).join(' ') ||
        snapshot.objectType ||
        'Locatie'
      );
    case 'CustomerGroup':
      return snapshot.name || 'Klantgroep';
    case 'Product':
      return snapshot.name || 'Product';
    case 'PriceTable':
      return snapshot.name || 'Prijstabel';
    case 'PriceTableItem':
      return snapshot.name || 'Prijstabelregel';
    case 'Request':
      return snapshot.title || 'Aanvraag';
    case 'Quote':
      return snapshot.quoteNumber || snapshot.subject || 'Offerte';
    case 'QuoteLine':
      return snapshot.description || 'Offerteregel';
    case 'QuoteTemplate':
      return snapshot.name || 'Sjabloon';
    case 'User':
      return (
        `${snapshot.firstName ?? ''} ${snapshot.lastName ?? ''}`.trim() ||
        snapshot.email ||
        'Gebruiker'
      );
    case 'Organization':
      return snapshot.name || 'Organisatie';
    default:
      return getEntityTypeLabel(entityType);
  }
}
