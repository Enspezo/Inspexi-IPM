import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantMiddleware } from './tenant.middleware';
import { PrismaService } from '@/prisma';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let prisma: any;

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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    middleware = module.get<TenantMiddleware>(TenantMiddleware);
    prisma = module.get<PrismaService>(PrismaService);
  });

  const createReq = (hostname: string) =>
    ({ hostname, tenant: undefined }) as any;

  const createRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
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
      const mockOrg = { id: 'org-1', slug: 'testorg', name: 'Test Org' };
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
  });

  describe('caching', () => {
    it('should cache org lookups', async () => {
      const mockOrg = { id: 'org-1', slug: 'cached', name: 'Cached Org' };
      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrg);

      const req1 = createReq('cached.localhost');
      const req2 = createReq('cached.localhost');
      const res = createRes();

      await middleware.use(req1, res, next);
      await middleware.use(req2, res, next);

      // Should only call database once
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledTimes(1);
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
});
