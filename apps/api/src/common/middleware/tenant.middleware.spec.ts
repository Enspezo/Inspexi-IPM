import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantMiddleware } from './tenant.middleware';
import { TenantCacheService } from '../services/tenant-cache.service';
import { EnumerationGuardService } from '../services/enumeration-guard.service';
import { PrismaService } from '@/prisma';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let prisma: any;
  let tenantCache: TenantCacheService;
  let enumerationGuard: EnumerationGuardService;

  const mockPrismaService = {
    organization: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: string) => {
      const config: Record<string, string> = {
        BASE_DOMAIN: 'localhost',
        SUPERUSER_SUBDOMAIN: 'mijn',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMiddleware,
        TenantCacheService,
        EnumerationGuardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    middleware = module.get<TenantMiddleware>(TenantMiddleware);
    prisma = module.get<PrismaService>(PrismaService);
    tenantCache = module.get<TenantCacheService>(TenantCacheService);
    enumerationGuard = module.get<EnumerationGuardService>(EnumerationGuardService);
  });

  const createReq = (hostname: string, ip = '203.0.113.1') =>
    ({ hostname, ip, tenant: undefined }) as any;

  const createRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  };

  const next = jest.fn();

  describe('hostname classification', () => {
    it('should classify base domain (localhost) as superuser', async () => {
      const req = createReq('localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: true,
      });
      expect(next).toHaveBeenCalled();
    });

    it('should classify SUPERUSER subdomain (mijn.localhost) as superuser', async () => {
      const req = createReq('mijn.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: true,
      });
      expect(next).toHaveBeenCalled();
    });

    it('should classify IP address as unknown', async () => {
      const req = createReq('127.0.0.1');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      });
      expect(next).toHaveBeenCalled();
    });

    it('should classify unrelated domain as unknown', async () => {
      const req = createReq('example.com');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('org subdomain resolution', () => {
    it('should resolve org subdomain and set tenant context', async () => {
      const mockOrg = { id: 'org-1', slug: 'testorg', name: 'Test Org', isActive: true };
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);

      const req = createReq('testorg.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: 'testorg',
        organization: mockOrg,
        orgId: 'org-1',
        isSuperuserDomain: false,
      });
      expect(next).toHaveBeenCalled();
    });

    it('should return 404 for unknown org slug', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      const req = createReq('nonexistent.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        statusCode: 404,
        message: "Organisatie 'nonexistent' niet gevonden",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 for an inactive org', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        slug: 'inactiveorg',
        name: 'Inactive Org',
        isActive: false,
      });

      const req = createReq('inactiveorg.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        statusCode: 404,
        message: "Organisatie 'inactiveorg' niet gevonden",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('should cache org lookups', async () => {
      const mockOrg = { id: 'org-1', slug: 'cached', name: 'Cached Org', isActive: true };
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);

      const req1 = createReq('cached.localhost');
      const req2 = createReq('cached.localhost');
      const res = createRes();

      await middleware.use(req1, res, next);
      await middleware.use(req2, res, next);

      // Should only call database once
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should re-query the database after cache invalidation', async () => {
      const mockOrg = { id: 'org-1', slug: 'invalidated', name: 'Org', isActive: true };
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);

      const res = createRes();
      await middleware.use(createReq('invalidated.localhost'), res, next);

      tenantCache.invalidate('invalidated');

      await middleware.use(createReq('invalidated.localhost'), res, next);

      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('nested subdomains', () => {
    it('should treat nested subdomains as unknown', async () => {
      const req = createReq('a.b.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      expect(req.tenant).toEqual({
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('database error handling', () => {
    it('should return null org when database throws', async () => {
      mockPrismaService.organization.findUnique.mockRejectedValue(
        new Error('DB connection failed'),
      );

      const req = createReq('failorg.localhost');
      const res = createRes();

      await middleware.use(req, res, next);

      // When findOrgBySlug returns null due to error, middleware returns 404
      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('enumeration protection (anti brute-force slug guessing)', () => {
    const ATTACKER_IP = '198.51.100.42';

    it('blocks a fourth lookup with 429 + Retry-After after 3 failed (404) lookups from the same IP', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      // 3 mislukte lookups → elk 404
      for (let i = 0; i < 3; i++) {
        const res = createRes();
        await middleware.use(createReq(`gok${i}.localhost`, ATTACKER_IP), res, next);
        expect(res.status).toHaveBeenCalledWith(404);
      }

      // 4e lookup vanaf hetzelfde IP → 429 + Retry-After, geen DB-call meer
      mockPrismaService.organization.findUnique.mockClear();
      const res = createRes();
      await middleware.use(createReq('gok4.localhost', ATTACKER_IP), res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        statusCode: 429,
        message: 'Te veel pogingen, probeer later opnieuw',
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
      const retryAfter = Number(res.setHeader.mock.calls[0][1]);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(300);
      // Geblokkeerd IP raakt de database niet meer aan.
      expect(mockPrismaService.organization.findUnique).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('does NOT count a successful (200) lookup towards the block', async () => {
      const mockOrg = { id: 'org-1', slug: 'valid', name: 'Valid', isActive: true };

      // Twee mislukkingen...
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      await middleware.use(createReq('bad1.localhost', ATTACKER_IP), createRes(), next);
      await middleware.use(createReq('bad2.localhost', ATTACKER_IP), createRes(), next);

      // ...een geslaagde lookup tussendoor (mag niet meetellen)...
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);
      const okRes = createRes();
      await middleware.use(createReq('valid.localhost', ATTACKER_IP), okRes, next);
      expect(okRes.status).not.toHaveBeenCalled(); // next() → geen 4xx/429

      // ...nog één mislukking. Dit is pas de 3e mislukking → nog GEEN block.
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      const res = createRes();
      await middleware.use(createReq('bad3.localhost', ATTACKER_IP), res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(429);
    });

    it('does not affect a different IP', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      for (let i = 0; i < 3; i++) {
        await middleware.use(createReq(`gok${i}.localhost`, ATTACKER_IP), createRes(), next);
      }

      // Ander IP dat een geldig subdomein laadt → gewoon toegestaan.
      const mockOrg = { id: 'org-2', slug: 'legit', name: 'Legit', isActive: true };
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);
      const res = createRes();
      await middleware.use(createReq('legit.localhost', '203.0.113.99'), res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('allows lookups again after the block window elapses', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-01T12:00:00Z'));
      try {
        mockPrismaService.organization.findUnique.mockResolvedValue(null);
        for (let i = 0; i < 3; i++) {
          await middleware.use(createReq(`gok${i}.localhost`, ATTACKER_IP), createRes(), next);
        }

        // Meteen geblokkeerd.
        const blockedRes = createRes();
        await middleware.use(createReq('gok9.localhost', ATTACKER_IP), blockedRes, next);
        expect(blockedRes.status).toHaveBeenCalledWith(429);

        // Na afloop van het 5-min blokkade-venster weer toegestaan.
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
        const mockOrg = { id: 'org-3', slug: 'mine', name: 'Mine', isActive: true };
        mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);
        const res = createRes();
        await middleware.use(createReq('mine.localhost', ATTACKER_IP), res, next);

        expect(res.status).not.toHaveBeenCalledWith(429);
        expect(next).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('is left untouched by the shared guard reference', () => {
      // Sanity: de middleware deelt exact deze service-instantie.
      expect(enumerationGuard).toBeInstanceOf(EnumerationGuardService);
    });
  });
});
