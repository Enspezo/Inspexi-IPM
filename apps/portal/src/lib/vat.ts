import { apiClient } from './api-client';

export interface VatValidationResult {
  checkedAt: string;
  isValid: boolean;
  userError: string;
  countryCode: string;
  vatNumber: string;
  name: string | null;
  address: string | null;
  requestIdentifier: string | null;
  requestDate: string | null;
}

export function checkVatNumber(vatNumber: string): Promise<VatValidationResult> {
  return apiClient.get<VatValidationResult>(
    `/vat/check?vatNumber=${encodeURIComponent(vatNumber)}`,
  );
}

/** Geeft true als het BTW-nummer een herkend formaat heeft (2 letters + minimaal 2 tekens) */
export function looksLikeVatNumber(value: string): boolean {
  return /^[A-Za-z]{2}.{2,}/.test(value.trim());
}
