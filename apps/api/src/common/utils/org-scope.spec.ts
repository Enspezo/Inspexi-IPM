import { Role } from '@prisma/client';
import { orgScope, orgScopeFor } from './org-scope';

describe('orgScope', () => {
  it('scopes regular users to their org', () => {
    const user = { roles: [Role.ORG_ADMIN], orgId: 'org-1' };
    expect(orgScope(user)).toEqual({ orgId: 'org-1' });
  });

  it('does not scope SUPERUSER without effective org', () => {
    const user = { roles: [Role.SUPERUSER], orgId: null };
    expect(orgScope(user)).toEqual({});
  });

  it('scopes SUPERUSER to the guard-resolved effective org (D2)', () => {
    // De TenantGuard zet op een org-subdomein de tenant-org op de request-user.
    const user = { roles: [Role.SUPERUSER], orgId: 'org-tenant' };
    expect(orgScope(user)).toEqual({ orgId: 'org-tenant' });
  });

  it('spreads cleanly into a where object', () => {
    const user = { roles: [Role.INSPECTEUR], orgId: 'org-2' };
    const where = { ...orgScope(user), isDeleted: false };
    expect(where).toEqual({ orgId: 'org-2', isDeleted: false });
  });
});

describe('orgScopeFor — tenant-matrix (D2: subdomein bepaalt de scope)', () => {
  it('SUPERUSER + org-tenant → scoped op de tenant-org', () => {
    const user = { roles: [Role.SUPERUSER], orgId: null };
    expect(orgScopeFor(user, { orgId: 'org-b' })).toEqual({ orgId: 'org-b' });
  });

  it('SUPERUSER + superuser-domein (tenant zonder org) → platform-breed', () => {
    const user = { roles: [Role.SUPERUSER], orgId: null };
    expect(orgScopeFor(user, { orgId: null })).toEqual({});
  });

  it('org-user + eigen tenant → scoped op de eigen org', () => {
    const user = { roles: [Role.ORG_ADMIN], orgId: 'org-a' };
    expect(orgScopeFor(user, { orgId: 'org-a' })).toEqual({ orgId: 'org-a' });
  });

  it('org-user zonder tenantcontext → scoped op de eigen org', () => {
    const user = { roles: [Role.BACKOFFICE], orgId: 'org-a' };
    expect(orgScopeFor(user, null)).toEqual({ orgId: 'org-a' });
  });

  it('org-user negeert een afwijkende tenant (TenantGuard blokkeert die al)', () => {
    // Verdediging in de diepte: zelfs als een org-user een vreemde tenant zou
    // meekrijgen, blijft de scope de eigen org.
    const user = { roles: [Role.MANAGER], orgId: 'org-a' };
    expect(orgScopeFor(user, { orgId: 'org-b' })).toEqual({ orgId: 'org-a' });
  });

  it('expliciete tenant wint van de effectieve org op de user (SUPERUSER)', () => {
    const user = { roles: [Role.SUPERUSER], orgId: 'org-resolved' };
    expect(orgScopeFor(user, { orgId: 'org-expliciet' })).toEqual({
      orgId: 'org-expliciet',
    });
  });
});
