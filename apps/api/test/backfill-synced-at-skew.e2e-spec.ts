/**
 * E2E voor scripts/backfill-synced-at-skew.ts (runbook stap 2).
 *
 * Werkt met een eigen wegwerp-probetabel `e2e_skew_probe` in `public` — de
 * tabel-discovery van het script (information_schema: synced_at + updated_at)
 * pikt die vanzelf op. Asserties gaan uitsluitend over de probetabel; de run
 * raakt óók de echte sync-tabellen, maar dat is precies het productiegedrag
 * (synced_at = updated_at is daar altijd een geldige basis, zie script-header).
 *
 * NB: geen app-bootstrap nodig — dit test het losse script tegen de database.
 */
import { PrismaClient } from '@prisma/client';
import { findSkewTables, runSkewBackfill } from '../scripts/backfill-synced-at-skew';

const PROBE = 'e2e_skew_probe';

describe('backfill-synced-at-skew script (e2e)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PROBE}"`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${PROBE}" (
         id text PRIMARY KEY,
         synced_at timestamptz,
         updated_at timestamptz NOT NULL
       )`,
    );
    // Drie gevallen: ms-skew (moet gerepareerd), NULL-anker (moet blijven
    // liggen — WP-D1-terrein), en al-gelijk (moet ongemoeid blijven).
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${PROBE}" (id, synced_at, updated_at) VALUES
         ('skewed',  '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.007Z'),
         ('null-anchor', NULL,                   '2026-07-01T11:00:00.000Z'),
         ('in-sync', '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z')`,
    );
  });

  afterAll(async () => {
    try {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PROBE}"`);
    } finally {
      await prisma.$disconnect();
    }
  });

  async function probeRows(): Promise<
    Array<{ id: string; synced_at: Date | null; updated_at: Date }>
  > {
    return prisma.$queryRawUnsafe(
      `SELECT id, synced_at, updated_at FROM "${PROBE}" ORDER BY id`,
    );
  }

  it('ontdekt tabellen met synced_at + updated_at (incl. de probetabel)', async () => {
    const tables = await findSkewTables(prisma);
    expect(tables).toContain(PROBE);
    expect(tables).toContain('imp_inspection_plans');
  });

  it('dry-run telt de skew-rijen maar schrijft niets', async () => {
    const result = await runSkewBackfill(prisma, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.perTable[PROBE]).toBe(1);

    // Niets geschreven: de skew-rij staat er nog precies zo bij.
    const rows = await probeRows();
    const skewed = rows.find((r) => r.id === 'skewed')!;
    expect(skewed.synced_at!.getTime()).not.toBe(skewed.updated_at.getTime());
  });

  it('echte run repareert alleen de skew-rij en laat NULL/in-sync met rust', async () => {
    const result = await runSkewBackfill(prisma, { dryRun: false });
    expect(result.dryRun).toBe(false);
    expect(result.perTable[PROBE]).toBe(1);

    const rows = await probeRows();
    const skewed = rows.find((r) => r.id === 'skewed')!;
    const nullAnchor = rows.find((r) => r.id === 'null-anchor')!;
    const inSync = rows.find((r) => r.id === 'in-sync')!;
    expect(skewed.synced_at!.getTime()).toBe(skewed.updated_at.getTime());
    expect(nullAnchor.synced_at).toBeNull();
    expect(inSync.synced_at!.getTime()).toBe(inSync.updated_at.getTime());
  });

  it('is idempotent: een tweede run raakt 0 rijen (en de dry-run telt 0)', async () => {
    const dry = await runSkewBackfill(prisma, { dryRun: true });
    expect(dry.perTable[PROBE]).toBe(0);

    const second = await runSkewBackfill(prisma, { dryRun: false });
    expect(second.perTable[PROBE]).toBe(0);
  });
});
