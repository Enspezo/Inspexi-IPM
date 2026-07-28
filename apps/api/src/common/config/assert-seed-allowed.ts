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
 * Aanroepen als allereerste statement in het seed-script, vóór élke
 * databaseactie (ook vóór `PrismaClient`-connects).
 */
export function assertSeedAllowed(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.NODE_ENV === 'production' && env.FORCE_SEED !== '1') {
    throw new Error(
      'GEWEIGERD: dit seed-script wist de VOLLEDIGE database en mag niet tegen ' +
        'een productie-omgeving draaien (NODE_ENV=production). ' +
        'Weet je 100% zeker dat dit de bedoeling is, zet dan expliciet FORCE_SEED=1. ' +
        'Er is niets gewijzigd of verwijderd.',
    );
  }
}
