import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the api-client module so persistLocationCoords is observable and never
// performs a real request.
vi.mock('./api-client', () => ({
  apiClient: {
    patch: vi.fn(() => Promise.resolve()),
  },
}));

import { geocodeAddress, persistLocationCoords } from './geocode';
import { apiClient } from './api-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const patchMock = apiClient.patch as unknown as ReturnType<typeof vi.fn>;

describe('geocode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('geocodeAddress', () => {
    it('builds the correct Nominatim URL + User-Agent and parses lat/lng', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ lat: '52.379189', lon: '4.899431' }],
      });

      const coords = await geocodeAddress({
        street: 'Damrak',
        houseNumber: '1',
        postalCode: '1012LG',
        city: 'Amsterdam',
      });

      expect(coords).toEqual({ lat: 52.379189, lng: 4.899431 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];

      // Endpoint + query flags
      expect(url).toContain('https://nominatim.openstreetmap.org/search?format=json&q=');
      expect(url).toContain('countrycodes=nl');
      expect(url).toContain('limit=1');
      // Address is URL-encoded and ends with ", Nederland"
      expect(url).toContain(encodeURIComponent('Damrak 1, 1012LG Amsterdam, Nederland'));
      // User-Agent header
      expect(init.headers['User-Agent']).toBe('InspeXi-Beheer/1.0');
    });

    it('returns the cached value on a second call (fetch only once)', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ lat: '52.0907', lon: '5.1214' }],
      });

      const addr = {
        street: 'Stationsplein',
        houseNumber: '7',
        postalCode: '3511ED',
        city: 'Utrecht',
      };

      const first = await geocodeAddress(addr);
      const second = await geocodeAddress(addr);

      expect(first).toEqual({ lat: 52.0907, lng: 5.1214 });
      expect(second).toEqual(first);
      // Second call must hit the in-module cache, not the network.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('caches a null result for an unresolvable address', async () => {
      mockFetch.mockResolvedValueOnce({ json: async () => [] });

      const addr = {
        street: 'Nergensstraat',
        houseNumber: '999',
        postalCode: '0000XX',
        city: 'Onbekend',
      };

      const first = await geocodeAddress(addr);
      const second = await geocodeAddress(addr);

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('persistLocationCoords', () => {
    it('PATCHes the flat /contacts/locations/:id route with { lat, lng }', () => {
      persistLocationCoords('loc-123', 52.1, 5.2);

      expect(patchMock).toHaveBeenCalledTimes(1);
      expect(patchMock).toHaveBeenCalledWith('/contacts/locations/loc-123', {
        lat: 52.1,
        lng: 5.2,
      });
    });
  });
});
