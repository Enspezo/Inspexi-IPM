/**
 * Single source of truth for which entity types can be favorited (starred).
 *
 * Every entry MUST be a canonical Prisma model name (PascalCase) that has both a
 * uuid `id` and an `orgId` column, so the service can resolve its prisma delegate
 * via `delegateFor(model)` and validate cross-tenant ownership before writing.
 */
export const FAVORITABLE_ENTITY_TYPES = [
  'Contact',
  'ContactPerson',
  'Location',
  'Request',
  'Quote',
  'Task',
  'Project',
  'Product',
] as const;

export type FavoritableEntityType = (typeof FAVORITABLE_ENTITY_TYPES)[number];

export function isFavoritableEntityType(v: string): v is FavoritableEntityType {
  return (FAVORITABLE_ENTITY_TYPES as readonly string[]).includes(v);
}
