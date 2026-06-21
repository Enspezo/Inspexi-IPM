import { Role } from '@/types';

/** Organisatie-beheer rollen (org settings, users, products, templates). */
export const ADMIN_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

/** CRM/backoffice rollen — toegang tot relaties, aanvragen, taken, notities, etc. */
export const CRM_ROLES: Role[] = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];
