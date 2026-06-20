import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '@/prisma';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GeocodingService', () => {
  let service: GeocodingService;
  let pdokLogCreate: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    pdokLogCreate = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeocodingService,
        {
          provide: ConfigService,
          useValue: { get: (_key: string, def: string) => def },
        },
        {
          provide: PrismaService,
          useValue: { pdokApiLog: { create: pdokLogCreate } },
        },
      ],
    }).compile();

    service = module.get<GeocodingService>(GeocodingService);
  });

  describe('suggest', () => {
    it('should return address suggestions from PDOK', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            docs: [
              { id: 'addr-1', weergavenaam: 'Kerkstraat 1, 1234 AB Amsterdam' },
              { id: 'addr-2', weergavenaam: 'Kerkstraat 2, 1234 AB Amsterdam' },
            ],
          },
        }),
      });

      const result = await service.suggest('Kerkstraat Amsterdam');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'addr-1',
        label: 'Kerkstraat 1, 1234 AB Amsterdam',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('suggest?q=Kerkstraat%20Amsterdam'),
      );
    });

    it('should return empty array when no results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { docs: [] } }),
      });

      const result = await service.suggest('nonexistent');

      expect(result).toEqual([]);
    });

    it('should throw BadGatewayException when PDOK is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.suggest('test')).rejects.toThrow(BadGatewayException);
      await expect(service.suggest('test')).rejects.toThrow('PDOK API onbereikbaar');
    });

    it('should throw BadGatewayException when PDOK returns non-OK status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(service.suggest('test')).rejects.toThrow(BadGatewayException);
    });

    it('should NOT write a PdokApiLog row (suggest is intentionally unlogged)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { docs: [] } }),
      });

      await service.suggest('Kerkstraat');

      expect(pdokLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('lookup', () => {
    it('should return parsed address with coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                straatnaam: 'Kerkstraat',
                huisnummer: 1,
                huisletter: 'a',
                huisnummertoevoeging: null,
                postcode: '1234AB',
                woonplaatsnaam: 'Amsterdam',
                centroide_ll: 'POINT(4.89 52.37)',
              },
            ],
          },
        }),
      });

      const result = await service.lookup('addr-1');

      expect(result.street).toBe('Kerkstraat');
      expect(result.houseNumber).toBe('1a');
      expect(result.postalCode).toBe('1234AB');
      expect(result.city).toBe('Amsterdam');
      expect(result.lat).toBeCloseTo(52.37);
      expect(result.lng).toBeCloseTo(4.89);
      expect(result.pdokData).toBeDefined();
    });

    it('should construct house number from parts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                straatnaam: 'Hoofdweg',
                huisnummer: 42,
                huisletter: 'b',
                huisnummertoevoeging: 'bis',
                postcode: '5678CD',
                woonplaatsnaam: 'Utrecht',
                centroide_ll: 'POINT(5.12 52.09)',
              },
            ],
          },
        }),
      });

      const result = await service.lookup('addr-2');

      expect(result.houseNumber).toBe('42bbis');
    });

    it('should throw NotFoundException when address not found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { docs: [] } }),
      });

      await expect(service.lookup('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.lookup('nonexistent')).rejects.toThrow('Adres niet gevonden');
    });

    it('should throw BadGatewayException for invalid coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                straatnaam: 'Test',
                huisnummer: 1,
                postcode: '1234AB',
                woonplaatsnaam: 'Test',
                centroide_ll: 'INVALID',
              },
            ],
          },
        }),
      });

      await expect(service.lookup('addr-bad')).rejects.toThrow(BadGatewayException);
      await expect(service.lookup('addr-bad')).rejects.toThrow(
        'Ongeldige coördinaten van PDOK',
      );
    });

    it('should throw BadGatewayException when PDOK is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.lookup('addr-1')).rejects.toThrow(BadGatewayException);
    });

    it('should write a PdokApiLog row when org context is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            docs: [
              {
                straatnaam: 'Kerkstraat',
                huisnummer: 1,
                postcode: '1234AB',
                woonplaatsnaam: 'Amsterdam',
                centroide_ll: 'POINT(4.89 52.37)',
              },
            ],
          },
        }),
      });

      await service.lookup('addr-1', { operation: 'LOOKUP', orgId: 'org-1', userId: 'user-1' });

      expect(pdokLogCreate).toHaveBeenCalledTimes(1);
      expect(pdokLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            userId: 'user-1',
            operation: 'LOOKUP',
            success: true,
            httpStatus: 200,
          }),
        }),
      );
    });

    it('should not write a log row when org context is absent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            docs: [
              {
                straatnaam: 'Kerkstraat',
                huisnummer: 1,
                postcode: '1234AB',
                woonplaatsnaam: 'Amsterdam',
                centroide_ll: 'POINT(4.89 52.37)',
              },
            ],
          },
        }),
      });

      await service.lookup('addr-1');

      expect(pdokLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('bagEnrich', () => {
    const vboResponse = (props: Record<string, unknown>) => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [{ properties: props }] }),
    });
    const pandResponse = (props: Record<string, unknown>) => ({
      ok: true,
      status: 200,
      json: async () => ({ properties: props }),
    });

    it('should return empty building data without an adresseerbaar object id', async () => {
      const result = await service.bagEnrich(null);

      expect(result).toEqual({
        gebruiksfunctie: null,
        bouwjaar: null,
        oppervlakte: null,
        bagId: null,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should parse verblijfsobject + pand into building data', async () => {
      mockFetch
        .mockResolvedValueOnce(
          vboResponse({
            oppervlakte: 72,
            gebruiksdoel: 'woonfunctie',
            'pand.href':
              'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items/uuid-1',
          }),
        )
        .mockResolvedValueOnce(
          pandResponse({ identificatie: '0363100012168433', bouwjaar: 2004 }),
        );

      const result = await service.bagEnrich('0363010000000001', {
        operation: 'BAG_ENRICH',
        orgId: 'org-1',
      });

      expect(result).toEqual({
        gebruiksfunctie: 'woonfunctie',
        oppervlakte: 72,
        bouwjaar: 2004,
        bagId: '0363100012168433',
      });
      // 2 calls (verblijfsobject + pand), both logged
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(pdokLogCreate).toHaveBeenCalledTimes(2);
      expect(pdokLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ operation: 'BAG_ENRICH', orgId: 'org-1' }),
        }),
      );
    });

    it('should pick the first value when gebruiksdoel is an array', async () => {
      mockFetch
        .mockResolvedValueOnce(
          vboResponse({
            oppervlakte: '120',
            gebruiksdoel: ['kantoorfunctie', 'winkelfunctie'],
            'pand.href':
              'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items/uuid-2',
          }),
        )
        .mockResolvedValueOnce(pandResponse({ identificatie: '999', bouwjaar: '1998' }));

      const result = await service.bagEnrich('vbo-2', { operation: 'BAG_ENRICH', orgId: 'o' });

      expect(result.gebruiksfunctie).toBe('kantoorfunctie');
      expect(result.oppervlakte).toBe(120);
      expect(result.bouwjaar).toBe(1998);
    });

    it('should degrade gracefully when the verblijfsobject is not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      });

      const result = await service.bagEnrich('vbo-missing', {
        operation: 'BAG_ENRICH',
        orgId: 'o',
      });

      expect(result).toEqual({
        gebruiksfunctie: null,
        bouwjaar: null,
        oppervlakte: null,
        bagId: null,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should keep vbo data when there is no pand href', async () => {
      mockFetch.mockResolvedValueOnce(
        vboResponse({ oppervlakte: 50, gebruiksdoel: 'woonfunctie' }),
      );

      const result = await service.bagEnrich('vbo-3', { operation: 'BAG_ENRICH', orgId: 'o' });

      expect(result.oppervlakte).toBe(50);
      expect(result.gebruiksfunctie).toBe('woonfunctie');
      expect(result.bouwjaar).toBeNull();
      expect(result.bagId).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should degrade gracefully on a network error and log the failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const result = await service.bagEnrich('vbo-4', { operation: 'BAG_ENRICH', orgId: 'o' });

      expect(result.oppervlakte).toBeNull();
      expect(pdokLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: false }),
        }),
      );
    });
  });

  describe('extractAdresseerbaarObjectId', () => {
    it('reads adresseerbaarobject_id from pdok data', () => {
      expect(
        service.extractAdresseerbaarObjectId({ adresseerbaarobject_id: '0363010000000001' }),
      ).toBe('0363010000000001');
    });

    it('returns null when missing', () => {
      expect(service.extractAdresseerbaarObjectId({})).toBeNull();
      expect(service.extractAdresseerbaarObjectId(null)).toBeNull();
    });
  });
});
