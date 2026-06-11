import { Role } from '@prisma/client';

interface ScopedUser {
  roles: Role[];
  orgId: string | null;
}

/**
 * Multi-tenant where-fragment: scopes a query to the user's organization.
 * SUPERUSER (orgId null) sees everything, so no orgId filter is applied.
 *
 * ```ts
 * const where: Prisma.TaskWhereInput = { ...orgScope(user), isDeleted: false };
 * ```
 *
 * NB: soft-delete filtering (`isDeleted: false`) is deliberately NOT included —
 * there is no Prisma middleware for it, and not every model has the field.
 * Add it explicitly where the model supports it.
 */
export function orgScope(user: ScopedUser): { orgId?: string } {
  if (user.roles.includes(Role.SUPERUSER)) {
    return {};
  }
  return { orgId: user.orgId! };
}
