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
    clientMagicLink: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    clientRefreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'rt-old' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inspectionPlan: { findFirst: jest.fn() },
    inspectionClientAccess: { upsert: jest.fn() },
    // Polymorf: array-vorm → Promise.all; callback-vorm (resetPassword, B-405)
    // → voer de callback direct uit op mockPrisma als transactie-client.
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(mockPrisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
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

  // ── B-405 (WP-C2): magic-/reset-links atomisch consumeren (TOCTOU) ──
  describe('magic-link consumptie (B-405, atomisch)', () => {
    const validLink = (overrides: Record<string, unknown> = {}) => ({
      id: 'link-1',
      token: 'tok-1',
      email: 'k@klant.nl',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      inspectionPlanId: null,
      clientUserId: 'cu-1',
      createdBy: null,
      clientUser: activeUser,
      ...overrides,
    });

    it('validateMagicLink consumeert via een conditionele updateMany (usedAt null + niet verlopen)', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(validLink());
      mockPrisma.clientAccess.findFirst.mockResolvedValue({ id: 'access-1' });
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.clientUser.update.mockResolvedValue(activeUser);

      const res = await service.validateMagicLink('tok-1', 'org-A');
      expect(res.requiresRegistration).toBe(false);
      expect((res as { accessToken?: string }).accessToken).toBe('token');
      // De consume beslist op de rijen-teller, niet op een eerdere read.
      expect(mockPrisma.clientMagicLink.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrisma.clientMagicLink.update).not.toHaveBeenCalled();
    });

    it('validateMagicLink: verliezer van de race (count 0) krijgt de generieke 400 en GEEN tokens', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(validLink());
      mockPrisma.clientAccess.findFirst.mockResolvedValue({ id: 'access-1' });
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.validateMagicLink('tok-1', 'org-A')).rejects.toThrow(
        'Magic link ongeldig of verlopen',
      );
      // Geen sessie voor de verliezer: geen refresh-token aangemaakt.
      expect(mockPrisma.clientRefreshToken.create).not.toHaveBeenCalled();
    });

    it('validateMagicLink consumeert NIET bij requiresRegistration (register() doet dat)', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(
        validLink({ clientUser: null, clientUserId: null }),
      );

      const res = await service.validateMagicLink('tok-1', 'org-A');
      expect(res.requiresRegistration).toBe(true);
      expect(mockPrisma.clientMagicLink.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.clientMagicLink.update).not.toHaveBeenCalled();
    });

    it('register consumeert atomisch op het definitieve moment (mét clientUserId)', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(
        validLink({ clientUser: null, clientUserId: null }),
      );
      mockPrisma.clientUser.findUnique.mockResolvedValue(null);
      mockPrisma.clientUser.create.mockResolvedValue({ ...activeUser, id: 'cu-new' });
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.register(
        {
          magicLinkToken: 'tok-1',
          email: 'k@klant.nl',
          password: 'NieuwWachtwoord1!',
          firstName: 'Klaas',
          lastName: 'Klant',
        } as never,
        'org-A',
      );
      expect(res.accessToken).toBe('token');
      expect(mockPrisma.clientMagicLink.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date), clientUserId: 'cu-new' },
      });
    });

    it('register: verliezer van de race (count 0) krijgt 400 en geen sessie', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(
        validLink({ clientUser: null, clientUserId: null }),
      );
      mockPrisma.clientUser.findUnique.mockResolvedValue(null);
      mockPrisma.clientUser.create.mockResolvedValue({ ...activeUser, id: 'cu-new' });
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.register(
          {
            magicLinkToken: 'tok-1',
            email: 'k@klant.nl',
            password: 'NieuwWachtwoord1!',
            firstName: 'Klaas',
            lastName: 'Klant',
          } as never,
          'org-A',
        ),
      ).rejects.toThrow('Registratie vereist een geldige uitnodiging');
      expect(mockPrisma.clientRefreshToken.create).not.toHaveBeenCalled();
    });

    it('resetPassword consumeert het token in de transactie vóór het wachtwoord-schrijven', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(validLink());
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.clientUser.update.mockResolvedValue(activeUser);

      const res = await service.resetPassword({ token: 'tok-1', password: 'NieuwWachtwoord1!' } as never);
      expect(res.message).toContain('succesvol');
      expect(mockPrisma.clientMagicLink.updateMany).toHaveBeenCalledWith({
        where: { id: 'link-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      // Sessies ingetrokken na de wissel.
      expect(mockPrisma.clientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { clientUserId: 'cu-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('resetPassword: tweede gelijktijdige reset (count 0) zet GEEN wachtwoord', async () => {
      mockPrisma.clientMagicLink.findUnique.mockResolvedValue(validLink());
      mockPrisma.clientMagicLink.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resetPassword({ token: 'tok-1', password: 'AanvallerWachtwoord1!' } as never),
      ).rejects.toThrow('Reset-token ongeldig of verlopen');
      expect(mockPrisma.clientUser.update).not.toHaveBeenCalled();
      expect(mockPrisma.clientRefreshToken.updateMany).not.toHaveBeenCalled();
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
