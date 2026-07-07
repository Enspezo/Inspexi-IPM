export interface ContactRef {
  id: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  // Server-resolved, client-safe contactgegevens. Alleen gevuld voor de toegewezen
  // inspecteur (`assignedUser` op InspectionDetail) — de backend past alle privacy-regels toe
  // (org weergavemodus + consent + statische fallback). `reviewer` draagt deze NOOIT.
  phone?: string | null;
  email?: string | null;
}

export interface AddressFields {
  addressStreet?: string | null;
  addressHouseNumber?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
}
