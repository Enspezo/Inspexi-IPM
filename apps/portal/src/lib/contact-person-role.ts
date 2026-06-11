/**
 * Kleuren voor contactpersoon-rol-badges, gekoppeld aan de stabiele `code`
 * van de lookup-rij. Onbekende/eigen rollen vallen terug op grijs.
 */
export const roleColors: Record<string, string> = {
  ALGEMEEN: 'bg-blue-100 text-blue-800',
  TECHNISCH: 'bg-orange-100 text-orange-800',
  ADMINISTRATIEF: 'bg-green-100 text-green-800',
  ANDERS: 'bg-gray-100 text-gray-800',
};

/** Tailwind-klassen voor een rolbadge op basis van de rol-code. */
export function roleColor(code: string | null | undefined): string {
  return (code && roleColors[code]) || 'bg-gray-100 text-gray-800';
}

/** Label van een ingesloten rol-referentie, met streepje als fallback. */
export function roleLabel(
  role: { label?: string | null } | null | undefined,
): string {
  return role?.label || '—';
}
