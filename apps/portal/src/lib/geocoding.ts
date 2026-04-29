import { apiClient } from './api-client';

export interface AddressSuggestion {
  id: string;
  label: string;
}

export interface ParsedAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
  /** Volledige ruwe PDOK-respons — inclusief BAG-IDs, gemeente, provincie, wijk, buurt */
  pdokData: Record<string, unknown>;
}

export function suggestAddresses(q: string): Promise<AddressSuggestion[]> {
  return apiClient.get<AddressSuggestion[]>(
    `/geocoding/suggest?q=${encodeURIComponent(q)}`,
  );
}

export function lookupAddress(id: string): Promise<ParsedAddress> {
  return apiClient.get<ParsedAddress>(
    `/geocoding/lookup?id=${encodeURIComponent(id)}`,
  );
}
