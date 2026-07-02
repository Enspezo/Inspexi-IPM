import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { FeatureGuard } from './feature.guard';
import {
  REQUIRES_FEATURE_KEY,
  ALLOW_DOWNGRADED_EXPORT_KEY,
} from '../decorators/requires-feature.decorator';
import { TenantContext } from '../interfaces/tenant-context.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { FeatureKey } from '@inspexi/entitlements';

describe('FeatureGuard', () => {
  let reflector: Reflector;
  let entitlements: { getEnabledFeatures: jest.Mock };

  const buildGuard = async (baseDomain = 'localhost'): Promise<FeatureGuard> => {
    entitlements = { getEnabledFeatures: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => baseDomain) } },
        { provide: EntitlementsService, useValue: entitlements },
      ],
    }).compile();
    reflector = module.get<Reflector>(Reflector);
    return module.get<FeatureGuard>(FeatureGuard);
  };

  /** Configureer de twee metadata-lookups van de guard. */
  const setMeta = (opts: { feature?: FeatureKey[]; downgrade?: boolean }) => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key) => {
      if (key === REQUIRES_FEATURE_KEY) return opts.feature;
      if (key === ALLOW_DOWNGRADED_EXPORT_KEY) return opts.downgrade;
      return undefined;
    });
  };

  const tenant = (orgId: string | null, isSuperuserDomain = false): TenantContext => ({
    slug: orgId ? 'acme' : null,
    organization: null,
    orgId,
    isSuperuserDomain,
  });

  const ctx = (user: any, t?: TenantContext): ExecutionContext =>
    ({
      getHandler: () => ({ name: 'handler' }),
      getClass: () => ({ name: 'TestController' }),
      switchToHttp: () => ({
        getRequest: () => ({ user, tenant: t, method: 'GET', url: '/x' }),
      }),
    }) as unknown as ExecutionContext;

  describe('ungated routes', () => {
    it('allows a route without @RequiresFeature and never resolves features', async () => {
      const guard = await buildGuard();
      setMeta({ feature: undefined, downgrade: undefined });
      await expect(guard.canActivate(ctx(undefined, tenant('org-1')))).resolves.toBe(true);
      expect(entitlements.getEnabledFeatures).not.toHaveBeenCalled();
    });

    it('allows when @RequiresFeature is an empty key list', async () => {
      const guard = await buildGuard();
      setMeta({ feature: [], downgrade: false });
      await expect(guard.canActivate(ctx(undefined, tenant('org-1')))).resolves.toBe(true);
    });
  });

  describe('SUPERUSER bypass', () => {
    it('bypasses the feature check for SUPERUSER', async () => {
      const guard = await buildGuard();
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      const user = { id: 'su', orgId: null, roles: [Role.SUPERUSER] };
      await expect(guard.canActivate(ctx(user, tenant(null, true)))).resolves.toBe(true);
      expect(entitlements.getEnabledFeatures).not.toHaveBeenCalled();
    });
  });

  describe('gated routes (org from subdomein)', () => {
    it('allows when the org has the required feature', async () => {
      const guard = await buildGuard();
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      entitlements.getEnabledFeatures.mockResolvedValue(['BASIS_CRM', 'CRM_COMPLEET']);
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).resolves.toBe(true);
      expect(entitlements.getEnabledFeatures).toHaveBeenCalledWith('org-1');
    });

    it('throws 403 FEATURE_NOT_IN_PLAN when the feature is missing', async () => {
      const guard = await buildGuard();
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      entitlements.getEnabledFeatures.mockResolvedValue([
        'BASIS_CRM',
        'BASIS_INSPECTIES',
      ]);
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).rejects.toMatchObject({
        response: { code: 'FEATURE_NOT_IN_PLAN', success: false },
      });
    });

    it('requires ALL keys when multiple are given (AND-semantiek)', async () => {
      const guard = await buildGuard();
      setMeta({ feature: ['BASIS_CRM', 'CRM_COMPLEET'], downgrade: false });
      entitlements.getEnabledFeatures.mockResolvedValue(['BASIS_CRM']);
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('org resolution edge cases', () => {
    it('allows when no tenant context is present', async () => {
      const guard = await buildGuard();
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      await expect(guard.canActivate(ctx(undefined, undefined))).resolves.toBe(true);
    });

    it('falls open on localhost when org cannot be resolved (unknown host)', async () => {
      const guard = await buildGuard('localhost');
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      await expect(guard.canActivate(ctx(undefined, tenant(null)))).resolves.toBe(true);
    });

    it('fails secure in production when org cannot be resolved', async () => {
      const guard = await buildGuard('inspexi.nl');
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      await expect(guard.canActivate(ctx(undefined, tenant(null)))).rejects.toMatchObject({
        response: { code: 'FEATURE_NOT_IN_PLAN' },
      });
    });

    it('falls open on localhost for an unconfigured org (empty entitlement set)', async () => {
      const guard = await buildGuard('localhost');
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      entitlements.getEnabledFeatures.mockResolvedValue([]);
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).resolves.toBe(true);
    });

    it('enforces an empty entitlement set in production', async () => {
      const guard = await buildGuard('inspexi.nl');
      setMeta({ feature: ['CRM_COMPLEET'], downgrade: false });
      entitlements.getEnabledFeatures.mockResolvedValue([]);
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).rejects.toMatchObject({
        response: { code: 'FEATURE_NOT_IN_PLAN' },
      });
    });
  });

  describe('@AllowDowngradedExport', () => {
    it('lets SUPERUSER through and skips the feature check', async () => {
      const guard = await buildGuard();
      setMeta({ feature: undefined, downgrade: true });
      const user = { id: 'su', orgId: null, roles: [Role.SUPERUSER] };
      await expect(guard.canActivate(ctx(user, tenant(null, true)))).resolves.toBe(true);
      expect(entitlements.getEnabledFeatures).not.toHaveBeenCalled();
    });

    it('forbids a non-SUPERUSER even when the org would have the feature', async () => {
      const guard = await buildGuard();
      setMeta({ feature: undefined, downgrade: true });
      const user = { id: 'u', orgId: 'org-1', roles: [Role.ORG_ADMIN] };
      await expect(guard.canActivate(ctx(user, tenant('org-1')))).rejects.toMatchObject({
        response: { code: 'DOWNGRADED_EXPORT_FORBIDDEN' },
      });
    });
  });
});
