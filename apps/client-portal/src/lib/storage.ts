import { getTenantInfo } from './tenant';

/**
 * Tenant-scoped localStorage wrapper.
 *
 * Alle keys worden geprefixt met `inspexi:${slug}:` zodat UI-voorkeuren
 * (tabel-configuratie, sidebar-state, filters) niet lekken tussen
 * organisaties in dezelfde browser. Op het superuser-/basisdomein wordt
 * de vaste namespace 'mijn' gebruikt.
 */
function scopedKey(key: string): string {
  const { slug } = getTenantInfo();
  return `inspexi:${slug ?? 'mijn'}:${key}`;
}

export const tenantStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(scopedKey(key));
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(scopedKey(key), value);
    } catch {
      // Storage vol of niet beschikbaar
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(scopedKey(key));
    } catch {
      // Storage niet beschikbaar
    }
  },
};
