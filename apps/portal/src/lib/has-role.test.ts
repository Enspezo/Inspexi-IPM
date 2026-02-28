import { describe, it, expect } from 'vitest';
import { hasRole } from './has-role';
import { Role, type User } from '@/types';

const makeUser = (roles: Role[]): User =>
  ({
    id: 'user-1',
    email: 'test@test.nl',
    firstName: 'Test',
    lastName: 'User',
    roles,
    orgId: 'org-1',
    isActive: true,
    emailVerifiedAt: null,
    initials: null,
    avatarUrl: null,
    signatureType: null,
    signatureData: null,
    color: null,
    homeStreet: null,
    homeHouseNumber: null,
  }) as User;

describe('hasRole', () => {
  it('should return true when user has the required role', () => {
    const user = makeUser([Role.ORG_ADMIN]);
    expect(hasRole(user, Role.ORG_ADMIN)).toBe(true);
  });

  it('should return false when user does not have the required role', () => {
    const user = makeUser([Role.INSPECTEUR]);
    expect(hasRole(user, Role.ORG_ADMIN)).toBe(false);
  });

  it('should accept an array of roles and return true if any match', () => {
    const user = makeUser([Role.MANAGER]);
    expect(hasRole(user, [Role.ORG_ADMIN, Role.MANAGER])).toBe(true);
  });

  it('should return false when none of the array roles match', () => {
    const user = makeUser([Role.INSPECTEUR]);
    expect(hasRole(user, [Role.ORG_ADMIN, Role.MANAGER])).toBe(false);
  });

  it('should return true when user has multiple roles and one matches', () => {
    const user = makeUser([Role.BACKOFFICE, Role.WERKVOORBEREIDER]);
    expect(hasRole(user, Role.WERKVOORBEREIDER)).toBe(true);
  });

  it('should return false for null user', () => {
    expect(hasRole(null, Role.ORG_ADMIN)).toBe(false);
  });

  it('should return false for undefined user', () => {
    expect(hasRole(undefined, Role.ORG_ADMIN)).toBe(false);
  });

  it('should handle SUPERUSER role', () => {
    const user = makeUser([Role.SUPERUSER]);
    expect(hasRole(user, Role.SUPERUSER)).toBe(true);
    expect(hasRole(user, Role.ORG_ADMIN)).toBe(false);
  });
});
