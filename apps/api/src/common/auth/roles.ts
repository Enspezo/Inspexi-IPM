import { Role } from '@prisma/client';

/**
 * Gedeelde rol-sets voor de `@Roles()` guard-decorator.
 *
 * RolesGuard hanteert set-semantiek
 * (`requiredRoles.some((r) => user.roles.includes(r))`), dus de volgorde binnen
 * een set is irrelevant — alleen het lidmaatschap bepaalt de toegang.
 *
 * De sets vormen een oplopende hiërarchie (elke set voegt precies één rol toe):
 *   ORG_ADMINS ⊂ MANAGEMENT_ROLES ⊂ OFFICE_ROLES ⊂ CRM_ROLES ⊂ ALL_STAFF
 */

/** Organisatiebeheer & instellingen. */
export const ORG_ADMINS = [Role.SUPERUSER, Role.ORG_ADMIN] as const;

/** Beheer + management. */
export const MANAGEMENT_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
] as const;

/** Kantoor/sales-rollen (beheer + management + backoffice). */
export const OFFICE_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
] as const;

/** CRM-rollen — alle staf behalve de inspecteur. */
export const CRM_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
] as const;

/**
 * Controleurs voor het vier-ogen-principe op inspectieplannen (review/goedkeuren)
 * en de AI-voorcontrole (PRD-13). Geen subset van de hiërarchie hierboven:
 * WERKVOORBEREIDER wel, BACKOFFICE niet.
 */
export const REVIEW_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.WERKVOORBEREIDER,
] as const;

/** Iedereen met een account binnen een organisatie (incl. superuser). */
export const ALL_STAFF = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
] as const;
