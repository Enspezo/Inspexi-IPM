import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { TenantGuard } from './tenant.guard';
import { TenantContext } from '../interfaces/tenant-context.interface';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  const buildGuard = async (baseDomain = 'localhost'): Promise<TenantGuard> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => baseDomain),
          },
        },
      ],
    }).compile();

    reflector = module.get<Reflector>(Reflector);
    return module.get<TenantGuard>(TenantGuard);
  };

  beforeEach(async () => {
    guard = await buildGuard();
  });

  const createMockContext = (user?: any, tenant?: TenantContext): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user, tenant }),
      }),
    }) as unknown as ExecutionContext;

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('public routes', () => {
    it('should allow access for @Public() routes', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

      const context = createMockContext(undefined, undefined);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('no tenant context', () => {
    it('should allow access when no tenant middleware is applied', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const context = createMockContext(
        { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] },
        undefined,
      );
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('no user', () => {
    it('should deny access when user is missing', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: 'testorg',
        organization: null,
        orgId: 'org-1',
        isSuperuserDomain: false,
      };
      const context = createMockContext(undefined, tenant);
      expect(guard.canActivate(context)).toBe(false);
    });
  });

  describe('SUPERUSER access', () => {
    it('should allow SUPERUSER on any subdomain', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: 'someorg',
        organization: null,
        orgId: 'org-1',
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const context = createMockContext(user, tenant);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow SUPERUSER on superuser domain', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: true,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const context = createMockContext(user, tenant);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('unknown domain (tests, direct IP)', () => {
    it('should allow any user on unknown domain in local/dev', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      const context = createMockContext(user, tenant);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny non-SUPERUSER on unknown host in production (fail secure)', async () => {
      const prodGuard = await buildGuard('inspexi.nl');
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      const context = createMockContext(user, tenant);

      expect(() => prodGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should still allow SUPERUSER on unknown host in production', async () => {
      const prodGuard = await buildGuard('inspexi.nl');
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const context = createMockContext(user, tenant);
      expect(prodGuard.canActivate(context)).toBe(true);
    });
  });

  describe('SUPERUSER effectieve org (D2: subdomein bepaalt de scope)', () => {
    const createRequestContext = (
      user: any,
      tenant: TenantContext,
    ): { request: { user: any; tenant: TenantContext }; context: ExecutionContext } => {
      const request = { user, tenant };
      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;
      return { request, context };
    };

    it('zet de tenant-org als effectieve orgId op de request-user (org-subdomein)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const org = { id: 'org-1', name: 'Org 1' } as any;
      const tenant: TenantContext = {
        slug: 'someorg',
        organization: org,
        orgId: 'org-1',
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const { request, context } = createRequestContext(user, tenant);

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user.orgId).toBe('org-1');
      expect(request.user.organization).toBe(org);
      // Oorspronkelijke user-object blijft onaangetast (shallow clone)
      expect(user.orgId).toBeNull();
    });

    it('laat orgId null op het superuser-domein (platform-breed)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: true,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const { request, context } = createRequestContext(user, tenant);

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toBe(user);
      expect(request.user.orgId).toBeNull();
    });

    it('laat orgId null op een onbekende host (e2e/127.0.0.1)', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: null, roles: [Role.SUPERUSER] };
      const { request, context } = createRequestContext(user, tenant);

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toBe(user);
      expect(request.user.orgId).toBeNull();
    });
  });

  describe('superuser domain — non-SUPERUSER', () => {
    it('should deny non-SUPERUSER on superuser domain', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: null,
        organization: null,
        orgId: null,
        isSuperuserDomain: true,
      };
      const user = { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      const context = createMockContext(user, tenant);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Gebruik het subdomein van uw organisatie om in te loggen',
      );
    });
  });

  describe('org subdomain — cross-tenant isolation', () => {
    it('should allow user on their own org subdomain', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: 'myorg',
        organization: null,
        orgId: 'org-1',
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      const context = createMockContext(user, tenant);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny user on a different org subdomain', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const tenant: TenantContext = {
        slug: 'otherorg',
        organization: null,
        orgId: 'org-2',
        isSuperuserDomain: false,
      };
      const user = { id: 'u1', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      const context = createMockContext(user, tenant);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'U heeft geen toegang tot deze organisatie',
      );
    });
  });
});
