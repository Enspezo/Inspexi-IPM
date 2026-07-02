import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';

/**
 * Resolve the caller's organization id, or reject when none is selected.
 *
 * Replaces the per-service `private requireOrg(user)` copies. A user without an
 * `orgId` (e.g. a SUPERUSER on a non-org domain) cannot perform org-scoped
 * writes, so callers that need a concrete org get a clear 400.
 */
export function requireOrg(user: User): string {
  if (!user.orgId) {
    throw new BadRequestException('Selecteer eerst een organisatie');
  }
  return user.orgId;
}

/**
 * Assert that a user may act within a given organization. SUPERUSER bypasses the
 * check; any other user must belong to `orgId`. Replaces the per-service
 * `private checkOrgAccess(user, orgId)` copies.
 */
export function assertOrgAccess(user: User, orgId: string): void {
  if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== orgId) {
    throw new ForbiddenException();
  }
}
