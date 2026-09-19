import type { Role, ChatThread } from '@/types';
import { getRoleLabel } from '@/lib/roles';

export function teamLabel(role: Role | string | null | undefined): string {
  if (!role) return 'Team';
  return `${getRoleLabel(role)}-team`;
}

/** Weergavetitel van een thread (counterpart-naam of teamnaam). */
export function threadTitle(thread: ChatThread): string {
  if (thread.type === 'TEAM') return teamLabel(thread.teamRole);
  const c = thread.counterpart;
  return c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Gebruiker' : 'Gebruiker';
}

/**
 * Map een SearchEntityType (lowercase, van /search) naar de canonieke PascalCase
 * modelnaam die de chat-referentie + getEntityLink verwacht.
 */
export const SEARCH_TYPE_TO_REFERENCE: Record<string, string> = {
  contact: 'Contact',
  contactPerson: 'ContactPerson',
  location: 'Location',
  request: 'Request',
  quote: 'Quote',
  task: 'Task',
  document: 'Document',
  product: 'Product',
};
