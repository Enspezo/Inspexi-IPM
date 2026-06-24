import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, SupportAccessAction, User } from '@prisma/client';
import { SupportAccessService } from './support-access.service';
import { TenantCacheService } from '@/common/services/tenant-cache.service';
import { PrismaService } from '@/prisma';

describe('SupportAccessService', () => {
  let service: SupportAccessService;

  const orgAdmin = {
    id: 'user-oa',
    roles: [Role.ORG_ADMIN],
    orgId: 'org-1',
  } as unknown as User;

  const superuser = {
    id: 'user-su',
    roles: [Role.SUPERUSER],
    orgId: null,
  } as unknown as User;

  const mockPrisma = {
    organization: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    supportAccessLog: {
      create: jest.fn(),
    },
    // Sequentiële array-transactie → resolve elke operatie zoals Prisma dat doet.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const mockTenantCache = {
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantCacheService, useValue: mockTenantCache },
      ],
    }).compile();

    service = module.get<SupportAccessService>(SupportAccessService);
  });

  describe('assertScope (via getStatus)', () => {
    it('staat ORG_ADMIN op de eigen org toe', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        supportAccessEnabled: false,
        supportAccessExpiresAt: null,
      });

      await expect(service.getStatus(orgAdmin, 'org-1')).resolves.toEqual({
        supportAccessEnabled: false,
        supportAccessExpiresAt: null,
      });
    });

    it('weigert ORG_ADMIN op een andere org (403)', async () => {
      await expect(service.getStatus(orgAdmin, 'org-2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it('staat SUPERUSER op elke org toe', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        supportAccessEnabled: true,
        supportAccessExpiresAt: null,
      });

      await expect(service.getStatus(superuser, 'org-99')).resolves.toBeDefined();
    });

    it('gooit NotFound wanneer de org niet bestaat', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.getStatus(superuser, 'org-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setAccess', () => {
    it('schrijft een ENABLED-log met expiry, performer + IP en invalideert de cache', async () => {
      const expiresAt = new Date('2026-07-01T00:00:00Z');
      mockPrisma.organization.update.mockResolvedValue({
        slug: 'org1slug',
        supportAccessEnabled: true,
        supportAccessExpiresAt: expiresAt,
      });
      mockPrisma.supportAccessLog.create.mockResolvedValue({ id: 'log-1' });

      const result = await service.setAccess(
        orgAdmin,
        'org-1',
        { enabled: true, expiresInHours: 24, note: 'Voor support' },
        '10.0.0.1',
        'jest-agent',
      );

      // Org-update: toggle aan + concrete vervaldatum
      const updateArg = mockPrisma.organization.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'org-1' });
      expect(updateArg.data.supportAccessEnabled).toBe(true);
      expect(updateArg.data.supportAccessExpiresAt).toBeInstanceOf(Date);

      // Logregel
      expect(mockPrisma.supportAccessLog.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          action: SupportAccessAction.ENABLED,
          performedById: 'user-oa',
          performedByRole: Role.ORG_ADMIN,
          ip: '10.0.0.1',
          userAgent: 'jest-agent',
          note: 'Voor support',
        },
      });

      // Cache-invalidatie op slug zodat de interceptor de toggle meteen ziet
      expect(mockTenantCache.invalidate).toHaveBeenCalledWith('org1slug');

      expect(result).toEqual({
        supportAccessEnabled: true,
        supportAccessExpiresAt: expiresAt,
      });
    });

    it('schrijft een DISABLED-log en zet expiry op null bij uitschakelen', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        slug: 'org1slug',
        supportAccessEnabled: false,
        supportAccessExpiresAt: null,
      });
      mockPrisma.supportAccessLog.create.mockResolvedValue({ id: 'log-2' });

      await service.setAccess(orgAdmin, 'org-1', { enabled: false });

      const updateArg = mockPrisma.organization.update.mock.calls[0][0];
      expect(updateArg.data).toEqual({
        supportAccessEnabled: false,
        supportAccessExpiresAt: null,
      });
      expect(mockPrisma.supportAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: SupportAccessAction.DISABLED }),
        }),
      );
    });

    it('zet geen expiry wanneer enabled zonder expiresInHours', async () => {
      mockPrisma.organization.update.mockResolvedValue({
        slug: 'org1slug',
        supportAccessEnabled: true,
        supportAccessExpiresAt: null,
      });
      mockPrisma.supportAccessLog.create.mockResolvedValue({ id: 'log-3' });

      await service.setAccess(orgAdmin, 'org-1', { enabled: true });

      const updateArg = mockPrisma.organization.update.mock.calls[0][0];
      expect(updateArg.data.supportAccessExpiresAt).toBeNull();
    });

    it('weigert een ORG_ADMIN op een andere org (403) zonder te schrijven', async () => {
      await expect(
        service.setAccess(orgAdmin, 'org-2', { enabled: true }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      expect(mockPrisma.supportAccessLog.create).not.toHaveBeenCalled();
    });
  });

  describe('logAccess', () => {
    it('schrijft een ACCESSED-log met rol SUPERUSER', async () => {
      mockPrisma.supportAccessLog.create.mockResolvedValue({ id: 'log-acc' });

      await service.logAccess('org-1', 'user-su', '8.8.8.8');

      expect(mockPrisma.supportAccessLog.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          action: SupportAccessAction.ACCESSED,
          performedById: 'user-su',
          performedByRole: Role.SUPERUSER,
          ip: '8.8.8.8',
        },
      });
    });
  });

  describe('expireGrants', () => {
    it('zet verlopen grants uit, logt EXPIRED en invalideert de cache', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', slug: 'org1slug' },
        { id: 'org-2', slug: 'org2slug' },
      ]);
      mockPrisma.organization.update.mockResolvedValue({});
      mockPrisma.supportAccessLog.create.mockResolvedValue({});

      const count = await service.expireGrants(new Date('2026-06-24T12:00:00Z'));

      expect(count).toBe(2);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { supportAccessEnabled: false, supportAccessExpiresAt: null },
      });
      expect(mockPrisma.supportAccessLog.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-2',
          action: SupportAccessAction.EXPIRED,
          note: 'Automatisch verlopen (JIT).',
        },
      });
      expect(mockTenantCache.invalidate).toHaveBeenCalledWith('org1slug');
      expect(mockTenantCache.invalidate).toHaveBeenCalledWith('org2slug');
    });

    it('doet niets wanneer er geen verlopen grants zijn', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);

      const count = await service.expireGrants();

      expect(count).toBe(0);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      expect(mockPrisma.supportAccessLog.create).not.toHaveBeenCalled();
      expect(mockTenantCache.invalidate).not.toHaveBeenCalled();
    });

    it('filtert op enabled grants met een vervaldatum in het verleden', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);
      const now = new Date('2026-06-24T12:00:00Z');

      await service.expireGrants(now);

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith({
        where: {
          supportAccessEnabled: true,
          supportAccessExpiresAt: { not: null, lt: now },
        },
        select: { id: true, slug: true },
      });
    });
  });
});
