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
    customFields: 'Eigen velden',
  },
  ContactPerson: {
    contactId: 'Relatie',
    role: 'Rol',
  },
  Location: {
    contactId: 'Relatie',
    objectType: 'Objecttype',
    customFields: 'Eigen velden',
  },
  CustomerGroup: {},
  ProductGroup: {
    notes: 'Notities',
  },
  Product: {
    unit: 'Eenheid',
    defaultVat: 'Standaard BTW',
    productGroupId: 'Productgroep',
    customFields: 'Eigen velden',
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
    customFields: 'Eigen velden',
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
    customFields: 'Eigen velden',
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
    color: 'Kleur',
  },
  Organization: {
    slug: 'Slug',
    logoUrl: 'Logo URL',
    primaryColor: 'Primaire kleur',
    defaultVat: 'Standaard BTW',
    defaultValidityDays: 'Standaard geldigheidsdagen',
  },
  CustomFieldDefinition: {
    entityType: 'Entiteitstype',
    fieldName: 'Veldnaam',
    label: 'Label',
    fieldType: 'Veldtype',
    options: 'Opties',
    isRequired: 'Verplicht',
    sortOrder: 'Sortering',
  },
  EmailTemplate: {
    type: 'Type',
    name: 'Naam',
    subject: 'Onderwerp',
    bodyJson: 'Inhoud (JSON)',
    bodyHtml: 'Inhoud (HTML)',
    isActive: 'Actief',
    createdBy: 'Aangemaakt door',
  },
  PlanningItem: {
    status: 'Status',
    contactId: 'Relatie',
    locationId: 'Locatie',
    quoteId: 'Offerte',
    productId: 'Product',
    productName: 'Product naam',
    scheduledDate: 'Datum',
    scheduledTime: 'Tijdstip',
    durationMinutes: 'Duur (minuten)',
    labels: 'Labels',
    notes: 'Opmerkingen',
    publicToken: 'Portaal token',
    createdBy: 'Aangemaakt door',
  },
};

export function getFieldLabel(entityType: string, field: string): string {
  return (
    entityLabels[entityType]?.[field] ??
    commonLabels[field] ??
    field
  );
}
