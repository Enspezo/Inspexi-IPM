import { Role } from '@/types';

/** Nederlandse rol-labels — één bron voor badges, chat-teamtitels en goedkeuringen. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPERUSER]: 'Superuser',
  [Role.ORG_ADMIN]: 'Beheerder',
  [Role.MANAGER]: 'Manager',
  [Role.BACKOFFICE]: 'Backoffice',
  [Role.WERKVOORBEREIDER]: 'Werkvoorbereider',
  [Role.INSPECTEUR]: 'Inspecteur',
};

/** Label-lookup die ook onbekende/ruwe rolstrings netjes teruggeeft. */
export function getRoleLabel(role: Role | string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role as Role] ?? role;
}

/** Organisatie-beheer rollen (org settings, users, products, templates). */
export const ADMIN_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

/** Beheer + management — mogen org-brede overzichten inzien (bijv. support-tickets). */
export const MANAGEMENT_ROLES: Role[] = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
];

/** CRM/backoffice rollen — toegang tot relaties, aanvragen, taken, notities, etc. */
export const CRM_ROLES: Role[] = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];
