import { Role } from '@prisma/client';
import { orgScope } from './org-scope';

describe('orgScope', () => {
  it('scopes regular users to their org', () => {
    const user = { roles: [Role.ORG_ADMIN], orgId: 'org-1' };
    expect(orgScope(user)).toEqual({ orgId: 'org-1' });
  });

  it('does not scope SUPERUSER', () => {
    const user = { roles: [Role.SUPERUSER], orgId: null };
    expect(orgScope(user)).toEqual({});
  });

  it('spreads cleanly into a where object', () => {
    const user = { roles: [Role.INSPECTEUR], orgId: 'org-2' };
    const where = { ...orgScope(user), isDeleted: false };
    expect(where).toEqual({ orgId: 'org-2', isDeleted: false });
  });
});
