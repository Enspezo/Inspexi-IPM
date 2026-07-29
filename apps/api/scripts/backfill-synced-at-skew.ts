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
 * Idempotent: de WHERE-clausule (`synced_at <> updated_at`) matcht na een
 * geslaagde run niets meer — een tweede run raakt 0 rijen.
 *
 * Gebruik (vanuit apps/api):
 *   npx ts-node scripts/backfill-synced-at-skew.ts             # uitvoeren
 *   npx ts-node scripts/backfill-synced-at-skew.ts --dry-run   # alleen tellen
 *
 * Draai dit vóór productie-uitrol van de bijbehorende sync-fix (00-herstelplan
 * §8 / RUNBOOK-DEPLOY.md stap 2); de --dry-run eerst, en plak de eindsamen-
 * vatting van de echte run in het logboek.
 */
import { PrismaClient } from '@prisma/client';

/** Tabellen die zowel synced_at als updated_at hebben (sommige sync-tabellen
 *  — bv. append-only media — kennen geen updated_at). */
export async function findSkewTables(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRaw<Array<{ table_name: string }>>`
    SELECT a.table_name FROM information_schema.columns a
    JOIN information_schema.columns b
      ON b.table_name = a.table_name AND b.table_schema = a.table_schema
    WHERE a.table_schema = 'public'
      AND a.column_name = 'synced_at' AND b.column_name = 'updated_at'
    ORDER BY a.table_name`;
  return rows.map((r) => r.table_name);
}

export interface SkewBackfillResult {
  dryRun: boolean;
  /** Per tabel: aantal rijen met skew (dry-run) resp. bijgewerkt (echte run). */
  perTable: Record<string, number>;
  total: number;
}

export async function runSkewBackfill(
  client: PrismaClient,
  opts: { dryRun: boolean },
): Promise<SkewBackfillResult> {
  const tables = await findSkewTables(client);
  const perTable: Record<string, number> = {};
  let total = 0;

  for (const table of tables) {
    let count: number;
    if (opts.dryRun) {
      const [row] = await client.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM "${table}" WHERE synced_at IS NOT NULL AND synced_at <> updated_at`,
      );
      count = Number(row.n);
    } else {
      count = await client.$executeRawUnsafe(
        `UPDATE "${table}" SET synced_at = updated_at WHERE synced_at IS NOT NULL AND synced_at <> updated_at`,
      );
    }
    perTable[table] = count;
    total += count;
  }

  return { dryRun: opts.dryRun, perTable, total };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');
  try {
    const result = await runSkewBackfill(prisma, { dryRun });

    const verb = dryRun ? 'te repareren (dry-run, niets geschreven)' : 'bijgewerkt';
    console.log(dryRun ? '— DRY-RUN: er wordt niets geschreven —' : '— Backfill synced_at-skew —');
    for (const [table, count] of Object.entries(result.perTable)) {
      console.log(`  ${table}: ${count} rijen ${verb}`);
    }
    console.log(
      `${dryRun ? 'ℹ' : '✔'} Samenvatting: ${result.total} rijen ${verb} over ${
        Object.keys(result.perTable).length
      } tabellen`,
    );
    if (!dryRun && result.total === 0) {
      console.log('  (0 rijen = skew al weg — het script is idempotent)');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Alleen uitvoeren als direct aangeroepen (niet bij import vanuit de e2e-spec).
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
