/**
 * Nederlandse veldbeschrijvingen voor de audit trail.
 * Georganiseerd per entityType met een gemeenschappelijke fallback.
 */

const commonLabels: Record<string, string> = {
  // Identificatie
  id: 'ID',
  orgId: 'Organisatie',
  name: 'Naam',
  email: 'E-mailadres',
  phone: 'Telefoon',
  notes: 'Notities',
  description: 'Beschrijving',
  isDeleted: 'Verwijderd',
  isActive: 'Actief',

  // Adresvelden
  street: 'Straat',
  houseNumber: 'Huisnummer',
  postalCode: 'Postcode',
  city: 'Stad',
  country: 'Land',

  // Gebruikersvelden
  firstName: 'Voornaam',
  lastName: 'Achternaam',
  role: 'Rol',
};

const entityLabels: Record<string, Record<string, string>> = {
  Contact: {
    type: 'Type',
    companyName: 'Bedrijfsnaam',
    website: 'Website',
    vatNumber: 'BTW-nummer',
    cocNumber: 'KvK-nummer',
    priceTableId: 'Prijstabel',
    ownerId: 'Eigenaar',
  },
  ContactPerson: {
    contactId: 'Relatie',
    role: 'Rol',
  },
  Location: {
    contactId: 'Relatie',
    objectType: 'Objecttype',
  },
  CustomerGroup: {},
  Product: {
    unit: 'Eenheid',
    defaultVat: 'Standaard BTW',
    category: 'Categorie',
  },
  PriceTable: {
    isDefault: 'Standaard',
  },
  PriceTableItem: {
    priceTableId: 'Prijstabel',
    productId: 'Product',
    priceType: 'Prijstype',
    basePrice: 'Basisprijs',
  },
  Request: {
    contactId: 'Relatie',
    locationId: 'Locatie',
    assignedTo: 'Toegewezen aan',
    source: 'Bron',
    status: 'Status',
    title: 'Titel',
    priority: 'Prioriteit',
    createdBy: 'Aangemaakt door',
  },
  Quote: {
    quoteNumber: 'Offertenummer',
    templateId: 'Sjabloon',
    requestId: 'Aanvraag',
    contactId: 'Relatie',
    locationId: 'Locatie',
    status: 'Status',
    subject: 'Onderwerp',
    subtotal: 'Subtotaal',
    discountTotal: 'Korting',
    vatTotal: 'BTW',
    total: 'Totaal',
    validUntil: 'Geldig tot',
    requiresApproval: 'Goedkeuring vereist',
    internalNotes: 'Interne notities',
    createdBy: 'Aangemaakt door',
  },
  QuoteLine: {
    quoteId: 'Offerte',
    productId: 'Product',
    quantity: 'Aantal',
    unit: 'Eenheid',
    unitPrice: 'Stukprijs',
    vatRate: 'BTW-tarief',
    discountPct: 'Korting %',
    lineTotal: 'Regeltotaal',
    sortOrder: 'Sortering',
  },
  QuoteTemplate: {
    defaultValidityDays: 'Standaard geldigheidsdagen',
    requiresApproval: 'Goedkeuring vereist',
  },
  User: {
    emailVerifiedAt: 'E-mail geverifieerd op',
  },
  Organization: {
    slug: 'Slug',
    logoUrl: 'Logo URL',
    primaryColor: 'Primaire kleur',
    defaultVat: 'Standaard BTW',
    defaultValidityDays: 'Standaard geldigheidsdagen',
  },
};

export function getFieldLabel(entityType: string, field: string): string {
  return (
    entityLabels[entityType]?.[field] ??
    commonLabels[field] ??
    field
  );
}
