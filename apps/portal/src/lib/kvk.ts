import { apiClient } from './api-client';

export interface KvkSearchResult {
  kvkNummer: string;
  naam: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}

export interface KvkCompanyProfile {
  kvkNummer: string;
  naam: string;
  website?: string;
  adressen: {
    type: string;
    straatnaam?: string;
    huisnummer?: string;
    postcode?: string;
    plaats?: string;
  }[];
}

export function searchKvk(q: string): Promise<KvkSearchResult[]> {
  return apiClient.get<KvkSearchResult[]>(
    `/kvk/zoeken?q=${encodeURIComponent(q)}`,
  );
}

export function getKvkProfile(kvkNummer: string): Promise<KvkCompanyProfile> {
  return apiClient.get<KvkCompanyProfile>(
    `/kvk/${encodeURIComponent(kvkNummer)}`,
  );
}
