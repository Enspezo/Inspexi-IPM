import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KvkService } from './kvk.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('KvkService', () => {
  let service: KvkService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KvkService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<KvkService>(KvkService);
  });

  describe('search', () => {
    it('should search by kvkNummer when query is numeric', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ resultaten: [] }),
      });

      await service.search('12345678');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('kvkNummer=12345678'),
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it('should search by naam when query is not numeric', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ resultaten: [] }),
      });

      await service.search('Test Bedrijf');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('naam=Test%20Bedrijf'),
        expect.any(Object),
      );
    });

    it('should map results including binnenlandsAdres fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          resultaten: [
            {
              kvkNummer: '12345678',
              naam: 'Test BV',
              adres: {
                binnenlandsAdres: {
                  straatnaam: 'Kerkstraat',
                  huisnummer: 1,
                  postcode: '1234AB',
                  plaats: 'Amsterdam',
                },
              },
            },
          ],
        }),
      });

      const result = await service.search('Test BV');

      expect(result).toEqual([
        {
          kvkNummer: '12345678',
          naam: 'Test BV',
          straatnaam: 'Kerkstraat',
          huisnummer: '1',
          postcode: '1234AB',
          plaats: 'Amsterdam',
        },
      ]);
    });

    it('should handle results without address', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          resultaten: [{ kvkNummer: '87654321', naam: 'Zonder Adres BV' }],
        }),
      });

      const result = await service.search('Zonder Adres');

      expect(result).toHaveLength(1);
      expect(result[0].straatnaam).toBeUndefined();
      expect(result[0].huisnummer).toBeUndefined();
    });

    it('should return empty array on 400/404 responses', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      expect(await service.search('niets')).toEqual([]);

      mockFetch.mockResolvedValue({ ok: false, status: 400 });
      expect(await service.search('fout')).toEqual([]);
    });

    it('should throw BadGatewayException when KvK API is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.search('test')).rejects.toThrow(BadGatewayException);
      await expect(service.search('test')).rejects.toThrow(
        'KvK API onbereikbaar',
      );
    });

    it('should throw BadGatewayException on non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(service.search('test')).rejects.toThrow(BadGatewayException);
      await expect(service.search('test')).rejects.toThrow('KvK API fout');
    });
  });

  describe('getProfile', () => {
    it('should return company profile with hoofdvestiging addresses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          kvkNummer: '12345678',
          naam: 'Test BV',
          _embedded: {
            hoofdvestiging: {
              website: 'https://test.nl',
              adressen: [
                {
                  type: 'bezoekadres',
                  straatnaam: 'Kerkstraat',
                  huisnummer: 1,
                  postcode: '1234AB',
                  plaats: 'Amsterdam',
                },
              ],
            },
          },
        }),
      });

      const result = await service.getProfile('12345678');

      expect(result.kvkNummer).toBe('12345678');
      expect(result.naam).toBe('Test BV');
      expect(result.website).toBe('https://test.nl');
      expect(result.adressen).toEqual([
        {
          type: 'bezoekadres',
          straatnaam: 'Kerkstraat',
          huisnummer: '1',
          postcode: '1234AB',
          plaats: 'Amsterdam',
        },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/basisprofielen/12345678'),
        expect.any(Object),
      );
    });

    it('should default address type to bezoekadres and handle missing hoofdvestiging', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ kvkNummer: '12345678', naam: 'Kale BV' }),
      });

      const result = await service.getProfile('12345678');

      expect(result.adressen).toEqual([]);
      expect(result.website).toBeUndefined();
    });

    it('should throw NotFoundException on 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(service.getProfile('00000000')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProfile('00000000')).rejects.toThrow(
        'Bedrijf niet gevonden in KvK',
      );
    });

    it('should throw BadGatewayException when KvK API is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.getProfile('12345678')).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should throw BadGatewayException on non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(service.getProfile('12345678')).rejects.toThrow(
        'KvK API fout',
      );
    });
  });
});
