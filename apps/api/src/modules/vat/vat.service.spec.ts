import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import { VatService } from './vat.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('VatService', () => {
  let service: VatService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VatService],
    }).compile();

    service = module.get<VatService>(VatService);
  });

  describe('check', () => {
    it('should return a valid result from VIES', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          isValid: true,
          vatNumber: '123456789B01',
          name: 'TEST BV',
          address: 'KERKSTRAAT 1, 1234AB AMSTERDAM',
          requestIdentifier: 'WAPIAAAAY123',
          requestDate: '2026-06-11',
        }),
      });

      const result = await service.check('NL123456789B01');

      expect(result.isValid).toBe(true);
      expect(result.countryCode).toBe('NL');
      expect(result.vatNumber).toBe('123456789B01');
      expect(result.name).toBe('TEST BV');
      expect(result.address).toBe('KERKSTRAAT 1, 1234AB AMSTERDAM');
      expect(result.requestIdentifier).toBe('WAPIAAAAY123');
      expect(result.userError).toBe('VALID');
      expect(result.checkedAt).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/NL/vat/123456789B01',
        expect.any(Object),
      );
    });

    it('should normalize spaces, dashes and dots in the VAT number', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ isValid: true }),
      });

      const result = await service.check('nl 1234.5678-9b01');

      expect(result.countryCode).toBe('NL');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/NL/vat/123456789B01'),
        expect.any(Object),
      );
    });

    it('should return an invalid result with INVALID userError', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          isValid: false,
          name: null,
          address: null,
        }),
      });

      const result = await service.check('NL999999999B99');

      expect(result.isValid).toBe(false);
      expect(result.userError).toBe('INVALID');
      expect(result.name).toBeNull();
    });

    it('should treat a 404 from VIES as an invalid number', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const result = await service.check('NL123456789B01');

      expect(result.isValid).toBe(false);
      expect(result.userError).toBe('INVALID');
      expect(result.requestIdentifier).toBeNull();
    });

    it('should throw BadRequestException for malformed VAT numbers', async () => {
      await expect(service.check('123')).rejects.toThrow(BadRequestException);
      await expect(service.check('1234567')).rejects.toThrow(
        'Ongeldig BTW-nummer formaat',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when VIES is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.check('NL123456789B01')).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.check('NL123456789B01')).rejects.toThrow(
        'VIES API onbereikbaar',
      );
    });

    it('should throw BadGatewayException on non-OK VIES response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(service.check('NL123456789B01')).rejects.toThrow(
        'VIES API fout',
      );
    });
  });
});
