import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { TenantOrgContext } from './org-scope';

/**
 * Resolve the caller's effective organization id, or reject when none is
 * selected.
 *
 * Beslissing D2 (WP-B3, B-503/B-504): **het subdomein bepaalt de scope.** Een
 * SUPERUSER op een org-subdomein schrijft dus in de org van dat subdomein; op
 * het superuser-domein (`mijn.*`) is er geen org en volgt een nette NL-400 in
 * plaats van een Prisma-fout (500).
 *
 * Replaces the per-service `private requireOrg(user)` copies.
 */
export function requireOrgFor(
  user: User,
  tenant: TenantOrgContext | null | undefined,
): string {
  if (user.roles.includes(Role.SUPERUSER) && tenant?.orgId) {
    return tenant.orgId;
  }
  if (!user.orgId) {
    throw new BadRequestException('Selecteer eerst een organisatie');
  }
  return user.orgId;
}

/**
 * @deprecated Gebruik `requireOrgFor(user, tenant)` en geef de tenantcontext
 * (`@CurrentTenant()`) expliciet mee waar die voorhanden is. Deze wrapper
 * blijft correct binnen een request doordat de `TenantGuard` de effectieve
 * org al op de request-user zet (D2), maar maakt de scoping-bron onzichtbaar.
 */
export function requireOrg(user: User): string {
  return requireOrgFor(user, null);
}

/**
 * Assert that a user may act within a given organization. SUPERUSER bypasses the
 * check; any other user must belong to `orgId`. Replaces the per-service
 * `private checkOrgAccess(user, orgId)` copies.
 *
 * WP-C1 (B-105/B-106): gooit een 404 met dezelfde melding als `assertFound`,
 * zodat "bestaat niet" en "hoort bij een andere org" op id-routes
 * ononderscheidbaar zijn (geen existence-oracle). Geef hetzelfde entiteitslabel
 * mee als de omliggende `assertFound`/`NotFoundException`.
 */
export function assertOrgAccess(user: User, orgId: string, entityName = 'Gegevens'): void {
  if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== orgId) {
    throw new NotFoundException(`${entityName} niet gevonden`);
  }
}
