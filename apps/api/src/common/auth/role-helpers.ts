import { Role } from '@prisma/client';
import { MANAGEMENT_ROLES, CRM_ROLES } from './roles';

/** Minimale user-vorm voor rol-checks (Prisma `User` of JWT-payload). */
interface RoledUser {
  roles: Role[];
}

/**
 * True als de user minstens één van de gevraagde rollen heeft. Set-semantiek,
 * identiek aan de `RolesGuard` (`requiredRoles.some((r) => user.roles.includes(r))`).
 */
export function hasRole(user: RoledUser, roles: readonly Role[]): boolean {
  return user.roles.some((r) => roles.includes(r));
}

/** SUPERUSER — platform-support, org-overstijgend (orgId null). */
export function isSuperuser(user: RoledUser): boolean {
  return user.roles.includes(Role.SUPERUSER);
}

/** Beheer + management (SUPERUSER, ORG_ADMIN, MANAGER). */
export function isManagement(user: RoledUser): boolean {
  return hasRole(user, MANAGEMENT_ROLES);
}

/** CRM/planners — alle staf behalve de INSPECTEUR (die alleen zichzelf mag lezen). */
export function isCrm(user: RoledUser): boolean {
  return hasRole(user, CRM_ROLES);
}
