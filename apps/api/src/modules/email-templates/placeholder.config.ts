export interface PlaceholderField {
  key: string;
  label: string;
}

export interface PlaceholderGroup {
  entity: string;
  label: string;
  fields: PlaceholderField[];
}

const ORGANISATIE: PlaceholderGroup = {
  entity: 'organisatie',
  label: 'Organisatie',
  fields: [
    { key: 'naam', label: 'Naam' },
    { key: 'email', label: 'E-mailadres' },
  ],
};

const CONTACT: PlaceholderGroup = {
  entity: 'contact',
  label: 'Contact',
  fields: [
    { key: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
    { key: 'voornaam', label: 'Voornaam' },
    { key: 'achternaam', label: 'Achternaam' },
    { key: 'email', label: 'E-mailadres' },
  ],
};

const OFFERTE: PlaceholderGroup = {
  entity: 'offerte',
  label: 'Offerte',
  fields: [
    { key: 'nummer', label: 'Offertenummer' },
    { key: 'onderwerp', label: 'Onderwerp' },
    { key: 'totaal', label: 'Totaalbedrag' },
    { key: 'vervalDatum', label: 'Vervaldatum' },
    { key: 'url', label: 'Link naar offerte' },
  ],
};

const AFSPRAAK: PlaceholderGroup = {
  entity: 'afspraak',
  label: 'Afspraak',
  fields: [
    { key: 'datum', label: 'Datum' },
    { key: 'tijd', label: 'Tijd' },
    { key: 'duur', label: 'Duur' },
    { key: 'locatie', label: 'Locatie' },
    { key: 'product', label: 'Dienst/Product' },
    { key: 'url', label: 'Link naar afspraak' },
  ],
};

const GEBRUIKER: PlaceholderGroup = {
  entity: 'gebruiker',
  label: 'Verzender',
  fields: [
    { key: 'voornaam', label: 'Voornaam' },
    { key: 'achternaam', label: 'Achternaam' },
    { key: 'email', label: 'E-mailadres' },
  ],
};

const UITNODIGING_VARS: PlaceholderGroup = {
  entity: 'uitnodiging',
  label: 'Uitnodiging',
  fields: [
    { key: 'rol', label: 'Rol' },
    { key: 'url', label: 'Uitnodigingslink' },
  ],
};

const NOTIFICATIE_VARS: PlaceholderGroup = {
  entity: 'notificatie',
  label: 'Notificatie',
  fields: [
    { key: 'titel', label: 'Titel' },
    { key: 'bericht', label: 'Bericht' },
  ],
};

const WACHTWOORD_VARS: PlaceholderGroup = {
  entity: 'wachtwoord',
  label: 'Wachtwoord reset',
  fields: [
    { key: 'url', label: 'Resetlink' },
  ],
};

export const TEMPLATE_TYPE_PLACEHOLDERS: Record<string, PlaceholderGroup[]> = {
  OFFERTE_VERSTUURD: [ORGANISATIE, CONTACT, OFFERTE, GEBRUIKER],
  OFFERTE_GEACCEPTEERD: [ORGANISATIE, CONTACT, OFFERTE, GEBRUIKER],
  OFFERTE_ANTWOORD: [ORGANISATIE, CONTACT, OFFERTE],
  AFSPRAAK_BEVESTIGING: [ORGANISATIE, CONTACT, AFSPRAAK],
  AFSPRAAK_VERPLAATST: [ORGANISATIE, CONTACT, AFSPRAAK],
  AFSPRAAK_ACCEPTATIE: [ORGANISATIE, GEBRUIKER, AFSPRAAK],
  CONTACT_EMAIL: [ORGANISATIE, CONTACT, GEBRUIKER],
  UITNODIGING: [ORGANISATIE, UITNODIGING_VARS],
  WACHTWOORD_RESET: [ORGANISATIE, WACHTWOORD_VARS],
  NOTIFICATIE: [ORGANISATIE, NOTIFICATIE_VARS],
  OFFERTE_FOLLOW_UP: [ORGANISATIE, CONTACT, OFFERTE, GEBRUIKER],
};

export const EMAIL_TEMPLATE_TYPE_LABELS: Record<string, string> = {
  OFFERTE_VERSTUURD: 'Offerte verstuurd',
  OFFERTE_GEACCEPTEERD: 'Offerte geaccepteerd',
  OFFERTE_ANTWOORD: 'Offerte antwoord',
  AFSPRAAK_BEVESTIGING: 'Afspraakbevestiging',
  AFSPRAAK_VERPLAATST: 'Afspraak verplaatst',
  AFSPRAAK_ACCEPTATIE: 'Afspraak acceptatie',
  CONTACT_EMAIL: 'Contact e-mail',
  UITNODIGING: 'Uitnodiging',
  WACHTWOORD_RESET: 'Wachtwoord reset',
  NOTIFICATIE: 'Notificatie',
  OFFERTE_FOLLOW_UP: 'Follow-up offerte',
};
