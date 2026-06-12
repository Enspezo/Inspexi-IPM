import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Minimal shape of a Prisma model delegate that we need for org checks.
 * Kept loose on purpose so any `this.prisma.<model>` can be passed in.
 */
interface OrgScopedDelegate {
  findUnique(args: {
    where: { id: string };
    select: { orgId: true };
  }): Promise<{ orgId: string | null } | null>;
  findMany(args: {
    where: { id: { in: string[] }; orgId: string };
    select: { id: true };
  }): Promise<Array<{ id: string }>>;
}

/**
 * Verify that an optional foreign-key reference belongs to the user's organization.
 *
 * - `id` empty/null → no-op (nothing to validate)
 * - `orgId` null (SUPERUSER) → no-op (no tenant scoping for superusers)
 * - referenced entity missing → NotFoundException
 * - referenced entity in another org → ForbiddenException
 *
 * Use in create/update services before writing a FK so a tenant cannot link to
 * another tenant's records by supplying a known UUID.
 */
export async function assertSameOrg(
  model: OrgScopedDelegate,
  id: string | null | undefined,
  orgId: string | null,
  label = 'Item',
): Promise<void> {
  if (!id || orgId === null) {
    return;
  }

  const entity = await model.findUnique({
    where: { id },
    select: { orgId: true },
  });

  if (!entity) {
    throw new NotFoundException(`${label} niet gevonden`);
  }

  if (entity.orgId !== orgId) {
    throw new ForbiddenException(`${label} hoort niet bij uw organisatie`);
  }
}

/**
 * Batch variant of {@link assertSameOrg} for an array of foreign keys.
 * Throws ForbiddenException if any id is missing or belongs to another org.
 */
export async function assertAllSameOrg(
  model: OrgScopedDelegate,
  ids: string[] | null | undefined,
  orgId: string | null,
  label = 'Items',
): Promise<void> {
  if (orgId === null || !ids || ids.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(ids)];
  const found = await model.findMany({
    where: { id: { in: uniqueIds }, orgId },
    select: { id: true },
  });

  if (found.length !== uniqueIds.length) {
    throw new ForbiddenException(`Een of meer ${label} horen niet bij uw organisatie`);
  }
}
