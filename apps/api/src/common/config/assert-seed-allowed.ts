/**
 * Productie-guard voor de seed-scripts (audit §7.5, gat §5.7).
 *
 * `prisma/seed.ts` wist de VOLLEDIGE database (150+ deleteMany-calls) voordat
 * hij herseed't. Per ongeluk draaien tegen een productie-database is dus
 * onherstelbaar dataverlies. Deze guard weigert elke run met
 * `NODE_ENV=production`, tenzij expliciet overruled met `FORCE_SEED=1`.
 *
 * Bewust NIET geraakt: `NODE_ENV=test`, `development` of unset — de e2e-flow
 * en de dev-loop seeden continu en moeten ongewijzigd blijven werken.
 *
 * Tweede slot (staging-review F11): ook een NIET-lokale `DATABASE_URL`-host
 * wordt geweigerd, ongeacht `NODE_ENV` — een dev-shell met een per ongeluk
 * geëxporteerde staging-/productie-URL is het realistischere ongeluk. Lokaal =
 * `localhost`, `127.0.0.1`, `::1` of een docker-compose-servicenaam (hostnaam
 * zónder punt, bv. `postgres`/`db`). Overrule met `FORCE_SEED=1`.
 *
 * Aanroepen als allereerste statement in het seed-script, vóór élke
 * databaseactie (ook vóór `PrismaClient`-connects).
 */
export function assertSeedAllowed(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.FORCE_SEED === '1') return;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'GEWEIGERD: dit seed-script wist de VOLLEDIGE database en mag niet tegen ' +
        'een productie-omgeving draaien (NODE_ENV=production). ' +
        'Weet je 100% zeker dat dit de bedoeling is, zet dan expliciet FORCE_SEED=1. ' +
        'Er is niets gewijzigd of verwijderd.',
    );
  }

  const host = databaseHost(env.DATABASE_URL);
  if (host !== null && !isLocalDatabaseHost(host)) {
    throw new Error(
      `GEWEIGERD: dit seed-script wist de VOLLEDIGE database en DATABASE_URL wijst ` +
        `naar een niet-lokale host ("${host}"). Alleen localhost/127.0.0.1/::1 of een ` +
        'docker-servicenaam (zonder punt) is toegestaan. ' +
        'Weet je 100% zeker dat dit de bedoeling is, zet dan expliciet FORCE_SEED=1. ' +
        'Er is niets gewijzigd of verwijderd.',
    );
  }
}

/** Hostnaam uit een DATABASE_URL; `null` als er geen (parseerbare) URL is. */
export function databaseHost(url: string | undefined): string | null {
  if (!url || url.trim().length === 0) return null;
  try {
    // WHATWG URL parst `postgresql://` als "special-less" scheme maar levert
    // wél host/hostname; IPv6 komt terug met blokhaken, die strippen we.
    const { hostname } = new URL(url);
    return hostname.replace(/^\[|\]$/g, '') || null;
  } catch {
    return null;
  }
}

/** localhost, loopback-IP's of een docker-servicenaam (geen punt). */
export function isLocalDatabaseHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  return !h.includes('.');
}
