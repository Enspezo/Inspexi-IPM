/**
 * Gedeelde Prisma-select voor een compacte user-samenvatting (id + naam +
 * e-mail). Gebruik op relatie-velden zoals `createdBy` / `assignedTo` /
 * `author` / `performedBy` i.p.v. de select telkens inline te herhalen.
 */
export const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;
