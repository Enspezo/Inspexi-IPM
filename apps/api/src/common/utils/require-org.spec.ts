import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { requireOrg, requireOrgFor, assertOrgAccess } from './require-org';

const superuser = { roles: [Role.SUPERUSER], orgId: null } as User;
const orgAdmin = { roles: [Role.ORG_ADMIN], orgId: 'org-a' } as User;

describe('requireOrgFor — tenant-matrix (D2: subdomein bepaalt de scope)', () => {
  it('SUPERUSER + org-tenant → tenant-org', () => {
    expect(requireOrgFor(superuser, { orgId: 'org-b' })).toBe('org-b');
  });

  it('SUPERUSER + superuser-domein → nette NL-400 (geen Prisma-500)', () => {
    expect(() => requireOrgFor(superuser, { orgId: null })).toThrow(
      BadRequestException,
    );
    expect(() => requireOrgFor(superuser, null)).toThrow(
      'Selecteer eerst een organisatie',
    );
  });

  it('SUPERUSER met guard-resolved effectieve org zonder expliciete tenant → die org', () => {
    const resolved = { roles: [Role.SUPERUSER], orgId: 'org-b' } as User;
    expect(requireOrgFor(resolved, null)).toBe('org-b');
  });

  it('org-user + eigen tenant → eigen org', () => {
    expect(requireOrgFor(orgAdmin, { orgId: 'org-a' })).toBe('org-a');
  });

  it('org-user zonder tenantcontext → eigen org', () => {
    expect(requireOrgFor(orgAdmin, null)).toBe('org-a');
  });

  it('org-user negeert een afwijkende tenant (TenantGuard blokkeert die al)', () => {
    expect(requireOrgFor(orgAdmin, { orgId: 'org-b' })).toBe('org-a');
  });
});

describe('requireOrg (deprecated wrapper)', () => {
  it('geeft de orgId van een org-user terug', () => {
    expect(requireOrg(orgAdmin)).toBe('org-a');
  });

  it('gooit een 400 voor een user zonder org', () => {
    expect(() => requireOrg(superuser)).toThrow(BadRequestException);
  });
});

describe('assertOrgAccess', () => {
  it('laat SUPERUSER altijd door', () => {
    expect(() => assertOrgAccess(superuser, 'org-x')).not.toThrow();
  });

  it('laat een org-user door binnen de eigen org', () => {
    expect(() => assertOrgAccess(orgAdmin, 'org-a')).not.toThrow();
  });

  it('blokkeert een org-user buiten de eigen org', () => {
    expect(() => assertOrgAccess(orgAdmin, 'org-b')).toThrow(
      ForbiddenException,
    );
  });
});
