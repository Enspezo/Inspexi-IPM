import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { ClientAuthService } from './client-auth.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

jest.mock('bcrypt');
const mockCompare = bcrypt.compare as jest.Mock;

describe('ClientAuthService (2e auth-realm, org-scoped)', () => {
  let service: ClientAuthService;

  const mockPrisma = {
    clientUser: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    clientAccess: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    clientMagicLink: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    clientRefreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'rt-old' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inspectionPlan: { findFirst: jest.fn() },
    inspectionClientAccess: { upsert: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const mockJwt = { signAsync: jest.fn().mockResolvedValue('token'), verifyAsync: jest.fn() };
  const mockConfig = {
    get: jest.fn((_k: string, def?: string) => def),
    getOrThrow: jest.fn(() => 'secret'),
  };
  const mockEmail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

  const activeUser = {
    id: 'cu-1',
    email: 'k@klant.nl',
    passwordHash: 'hash',
    status: 'ACTIVE',
    firstName: 'Klaas',
    lastName: 'Klant',
    phone: null,
    function: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();
    service = moduleRef.get(ClientAuthService);
  });

  describe('login', () => {
    it('gooit BadRequest zonder org-subdomein', async () => {
      await expect(service.login({ email: 'k@klant.nl', password: 'x' }, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('geeft tokens uit bij geldige creds + org-toegang (happy path)', async () => {
      mockPrisma.clientUser.findUnique.mockResolvedValue(activeUser);
      mockCompare.mockResolvedValue(true);
      mockPrisma.clientAccess.findFirst.mockResolvedValue({ id: 'access-1' });
      mockPrisma.clientUser.update.mockResolvedValue(activeUser);

      const res = await service.login({ email: 'k@klant.nl', password: 'ClientPass123!' }, 'org-A');
      expect(res.accessToken).toBe('token');
      expect(res.user.id).toBe('cu-1');
      // De org-toegangscheck scopet ALTIJD op de subdomein-org via het contact.
      expect(mockPrisma.clientAccess.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientUserId: 'cu-1',
            contact: { orgId: 'org-A', isDeleted: false },
          }),
        }),
      );
    });

    it('gooit Forbidden (cross-tenant) wanneer de klant geen toegang heeft in deze org', async () => {
      mockPrisma.clientUser.findUnique.mockResolvedValue(activeUser);
      mockCompare.mockResolvedValue(true);
      mockPrisma.clientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'k@klant.nl', password: 'ClientPass123!' }, 'org-B'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gooit Unauthorized bij een fout wachtwoord', async () => {
      mockPrisma.clientUser.findUnique.mockResolvedValue(activeUser);
      mockCompare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'k@klant.nl', password: 'wrong' }, 'org-A'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('toont alleen de toegang binnen deze org', async () => {
      mockPrisma.clientUser.findUnique.mockResolvedValue(activeUser);
      mockPrisma.clientAccess.findMany.mockResolvedValue([
        { role: 'VIEWER', contact: { id: 'contact-A', companyName: 'Klant BV', firstName: null, lastName: null } },
      ]);

      const res = await service.getMe('cu-1', 'org-A');
      expect(res.access).toHaveLength(1);
      expect(mockPrisma.clientAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientUserId: 'cu-1',
            contact: { orgId: 'org-A', isDeleted: false },
          }),
        }),
      );
    });
  });

  describe('refresh (stateful rotatie)', () => {
    it('roteert een geldig, gehasht refresh-token met org-toegang (oude verwijderd, nieuw uitgegeven)', async () => {
      mockPrisma.clientRefreshToken.findFirst.mockResolvedValue({
        id: 'rt-old',
        clientUser: activeUser,
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });
      mockPrisma.clientAccess.findFirst.mockResolvedValue({ id: 'access-1' });

      const res = await service.refresh('raw-refresh-token', 'org-A');
      expect(res.accessToken).toBe('token');
      // Rotatie: het gebruikte token is hard verwijderd en een nieuw token aangemaakt.
      expect(mockPrisma.clientRefreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-old' } });
      expect(mockPrisma.clientRefreshToken.create).toHaveBeenCalled();
      // Het rauwe refresh-token is een nieuwe, willekeurige waarde (geen JWT/geen echo).
      expect(typeof res.refreshToken).toBe('string');
      expect(res.refreshToken).not.toBe('raw-refresh-token');
    });

    it('zoekt op de SHA-256-hash van het rauwe token, nooit op de rauwe waarde', async () => {
      const raw = 'raw-refresh-token';
      const expectedHash = createHash('sha256').update(raw).digest('hex');
      mockPrisma.clientRefreshToken.findFirst.mockResolvedValue({
        id: 'rt-old',
        clientUser: activeUser,
        ipAddress: null,
        userAgent: null,
      });
      mockPrisma.clientAccess.findFirst.mockResolvedValue({ id: 'access-1' });

      await service.refresh(raw, 'org-A');
      expect(mockPrisma.clientRefreshToken.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tokenHash: expectedHash, revokedAt: null }),
        }),
      );
    });

    it('gooit Unauthorized voor een onbekend/ingetrokken/verlopen token', async () => {
      mockPrisma.clientRefreshToken.findFirst.mockResolvedValue(null);
      await expect(service.refresh('t', 'org-A')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.clientRefreshToken.delete).not.toHaveBeenCalled();
    });

    it('gooit BadRequest zonder org-subdomein', async () => {
      await expect(service.refresh('t', null)).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout (intrekken)', () => {
    it('trekt het meegegeven refresh-token in via zijn hash', async () => {
      const raw = 'raw-refresh-token';
      const expectedHash = createHash('sha256').update(raw).digest('hex');
      await service.logout(raw);
      expect(mockPrisma.clientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expectedHash, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is een no-op zonder token', async () => {
      await service.logout('');
      expect(mockPrisma.clientRefreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
