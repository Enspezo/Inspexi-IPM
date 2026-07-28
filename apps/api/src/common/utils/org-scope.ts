import { Role } from '@prisma/client';

interface ScopedUser {
  roles: Role[];
  orgId: string | null;
}

/**
 * Minimale tenantcontext voor org-scoping: alleen de org van het bezochte
 * subdomein is relevant. `TenantContext` (request-scope) voldoet structureel.
 */
export interface TenantOrgContext {
  orgId: string | null;
}

/**
 * Multi-tenant where-fragment: scopes a query to the effective organization.
 *
 * Beslissing D2 (WP-B3, B-502): **het subdomein bepaalt de scope.** Voor een
 * SUPERUSER geldt daarom:
 * - op een org-subdomein (`tenant.orgId` gezet) → scope op de bezochte org;
 * - op het superuser-domein (`mijn.*`) of een onbekende host → platform-breed.
 *
 * Zonder expliciete tenant valt de functie terug op `user.orgId`. Voor een
 * SUPERUSER is dat de *effectieve* org die de `TenantGuard` per request uit het
 * subdomein op de request-user zet (zie `TenantGuard`); buiten een request
 * (unit-tests, schedulers) is die `null` → platform-breed.
 *
 * ```ts
 * const where: Prisma.TaskWhereInput = { ...orgScopeFor(user, tenant), isDeleted: false };
 * ```
 *
 * NB: soft-delete filtering (`isDeleted: false`) is deliberately NOT included —
 * there is no Prisma middleware for it, and not every model has the field.
 * Add it explicitly where the model supports it.
 */
export function orgScopeFor(
  user: ScopedUser,
  tenant: TenantOrgContext | null | undefined,
): { orgId?: string } {
  if (user.roles.includes(Role.SUPERUSER)) {
    if (tenant?.orgId) {
      return { orgId: tenant.orgId };
    }
    // Effectieve org die de TenantGuard op de request-user heeft gezet (D2).
    if (user.orgId) {
      return { orgId: user.orgId };
    }
    return {};
  }
  return { orgId: user.orgId! };
}

/**
 * @deprecated Gebruik `orgScopeFor(user, tenant)` en geef de tenantcontext
 * (`@CurrentTenant()`) expliciet mee waar die voorhanden is. Deze wrapper
 * blijft correct binnen een request doordat de `TenantGuard` de effectieve
 * org al op de request-user zet, maar maakt de scoping-bron onzichtbaar.
 */
export function orgScope(user: ScopedUser): { orgId?: string } {
  return orgScopeFor(user, null);
}
