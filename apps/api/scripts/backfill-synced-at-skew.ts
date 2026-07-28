/**
 * Backfill voor de syncedAt/updatedAt ms-skew (ontdekt in WP-A1).
 *
 * De sync-push zette `syncedAt` met een eigen `new Date()` terwijl Prisma's
 * `@updatedAt` enkele ms later stempelde. Elke ooit gepushte rij heeft daardoor
 * `synced_at < updated_at`, wat bij de eerstvolgende push vanaf een vers
 * apparaat een onterecht conflict geeft (het apparaat neemt `synced_at` als
 * basisversie mee uit de pull, de server vergelijkt met `updated_at`).
 *
 * Dit script zet `synced_at = updated_at` op alle rijen waar `synced_at` al
 * gevuld is. Dat is veilig: `synced_at` wordt uitsluitend als basisversie aan
 * clients meegegeven in de pull, en diezelfde pull levert altijd de actuele
 * rij-inhoud mee — "basis = laatste versie" is dus per definitie correct.
 * Rijen met `synced_at IS NULL` blijven ongemoeid (dat is het aparte
 * versieanker-vraagstuk van WP-D1 / beslispunt A1).
 *
 * Gebruik (vanuit apps/api):  npx ts-node scripts/backfill-synced-at-skew.ts
 * Draai dit vóór productie-uitrol van de bijbehorende sync-fix (00-herstelplan §8).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Alleen tabellen die zowel synced_at als updated_at hebben (sommige
  // sync-tabellen — bv. append-only media — kennen geen updated_at).
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT a.table_name FROM information_schema.columns a
    JOIN information_schema.columns b
      ON b.table_name = a.table_name AND b.table_schema = a.table_schema
    WHERE a.table_schema = 'public'
      AND a.column_name = 'synced_at' AND b.column_name = 'updated_at'
    ORDER BY a.table_name`;

  let total = 0;
  for (const { table_name: table } of tables) {
    const count = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET synced_at = updated_at WHERE synced_at IS NOT NULL AND synced_at <> updated_at`,
    );
    if (count > 0) console.log(`  ${table}: ${count} rijen bijgewerkt`);
    total += count;
  }
  console.log(`✔ Backfill synced_at-skew klaar — ${total} rijen totaal`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
