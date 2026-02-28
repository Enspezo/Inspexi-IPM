import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GeocodingService', () => {
  let service: GeocodingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeocodingService],
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
  });
});
