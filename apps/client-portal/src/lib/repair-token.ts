import { getTenantInfo } from './tenant';

/**
 * Herstelsessie-token (PRD-14, online herstel).
 *
 * Het 96-tekens sessietoken is GEEN klant-JWT: het gaat als eigen Bearer-header
 * naar de /client/repair/*-endpoints (RepairSessionGuard). We houden het in
 * memory en spiegelen het naar sessionStorage — herstelbaar binnen de tab (na
 * een refresh), maar bewust niet cross-tab of persistent (PRD §14.9.1).
 * Zelfde tenant-scoping als lib/storage.ts (`inspexi:${slug}:…`).
 */

const TOKEN_KEY = 'repair-session-token';

function scopedKey(key: string): string {
  const { slug } = getTenantInfo();
  return `inspexi:${slug ?? 'mijn'}:${key}`;
}

let repairToken: string | null = null;

export function getRepairToken(): string | null {
  if (repairToken) return repairToken;
  try {
    repairToken = sessionStorage.getItem(scopedKey(TOKEN_KEY));
  } catch {
    // Storage niet beschikbaar (bijv. privacy-modus) — dan alleen in-memory.
  }
  return repairToken;
}

export function setRepairToken(token: string): void {
  repairToken = token;
  try {
    sessionStorage.setItem(scopedKey(TOKEN_KEY), token);
  } catch {
    // Storage niet beschikbaar — in-memory volstaat binnen deze tab.
  }
}

export function clearRepairToken(): void {
  repairToken = null;
  try {
    sessionStorage.removeItem(scopedKey(TOKEN_KEY));
  } catch {
    // Storage niet beschikbaar.
  }
}

export function hasRepairToken(): boolean {
  return !!getRepairToken();
}
