import { Injectable } from '@nestjs/common';

interface FailureEntry {
  count: number;
  /** Epoch ms waarna het failure-venster verlopen is (sliding). */
  expiresAt: number;
}

/**
 * Beschermt de org-subdomein-lookup tegen brute-force ENUMERATIE van geldige
 * slugs. De PWA valideert vóór login of een subdomein bestaat (200 vs 404);
 * dat verschil lekt welke organisaties bestaan.
 *
 * Per-IP teller die ALLEEN mislukte (404) lookups telt. Na {@link THRESHOLD}
 * mislukkingen binnen een schuivend venster van {@link WINDOW_MS} wordt het IP
 * tijdelijk geblokkeerd ({@link BLOCK_MS}); verdere lookups krijgen 429 +
 * Retry-After. Een geslaagde 200 raakt de teller nooit aan — legitieme
 * inspecteurs die hun eigen subdomein laden worden dus nooit buitengesloten.
 *
 * In-memory & gedeeld (@Global, single instance) — hetzelfde patroon als
 * {@link TenantCacheService}. Voldoende voor het huidige single-instance
 * deployment; bij horizontaal schalen kan dit later achter een gedeelde store
 * (Redis) worden gezet zonder de callers te wijzigen.
 */
@Injectable()
export class EnumerationGuardService {
  /** Aantal mislukte lookups binnen het venster dat een blokkade triggert. */
  private readonly THRESHOLD = 3;
  /** Schuivend telvenster voor mislukte lookups. */
  private readonly WINDOW_MS = 5 * 60 * 1000; // 5 minuten
  /** Duur van de blokkade zodra de drempel bereikt is. */
  private readonly BLOCK_MS = 5 * 60 * 1000; // 5 minuten

  private readonly failures = new Map<string, FailureEntry>();
  /** ip → epoch ms waarop de blokkade afloopt. */
  private readonly blocks = new Map<string, number>();

  /**
   * @returns het aantal resterende seconden dat het IP nog geblokkeerd is
   *   (voor de Retry-After-header), of 0 als het IP niet geblokkeerd is.
   */
  isBlocked(ip: string): number {
    const until = this.blocks.get(ip);
    if (until === undefined) {
      return 0;
    }
    const remainingMs = until - Date.now();
    if (remainingMs <= 0) {
      this.blocks.delete(ip);
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }

  /**
   * Registreer één mislukte (404) lookup voor dit IP. Bij het bereiken van de
   * drempel binnen het venster wordt het IP geblokkeerd. Aanroepen terwijl het
   * IP al geblokkeerd is heeft geen effect (verlengt de blokkade niet).
   */
  recordFailure(ip: string): void {
    if (this.isBlocked(ip) > 0) {
      return;
    }

    const now = Date.now();
    const entry = this.failures.get(ip);

    if (!entry || entry.expiresAt <= now) {
      // Nieuw of verlopen venster → opnieuw beginnen te tellen.
      this.failures.set(ip, { count: 1, expiresAt: now + this.WINDOW_MS });
      return;
    }

    entry.count += 1;
    entry.expiresAt = now + this.WINDOW_MS; // schuivend venster

    if (entry.count >= this.THRESHOLD) {
      this.blocks.set(ip, now + this.BLOCK_MS);
      this.failures.delete(ip);
    }
  }

  /** Volledig resetten (voornamelijk voor tests). */
  clear(): void {
    this.failures.clear();
    this.blocks.clear();
  }
}
