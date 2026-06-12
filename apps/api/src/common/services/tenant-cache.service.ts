import { Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';

interface CacheEntry {
  org: Organization;
  cachedAt: number;
}

/**
 * Gedeelde org-cache voor tenant-resolutie (slug → Organization).
 * TenantMiddleware leest hieruit; OrganizationsService invalideert bij
 * org-wijzigingen zodat een gedeactiveerde of gewijzigde org niet tot
 * 5 minuten lang uit een verouderde cache geserveerd wordt.
 */
@Injectable()
export class TenantCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get(slug: string): Organization | null {
    const entry = this.cache.get(slug);
    if (!entry || Date.now() - entry.cachedAt >= this.TTL) {
      return null;
    }
    return entry.org;
  }

  set(slug: string, org: Organization): void {
    this.cache.set(slug, { org, cachedAt: Date.now() });
  }

  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  clear(): void {
    this.cache.clear();
  }
}
