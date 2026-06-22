/**
 * Idempotent numbering backfill for existing data. Run once after the
 * `configurable_record_numbering` migration on a database that already has
 * requests / quotes / projects / products:
 *
 *   npx ts-node prisma/backfill-numbering.ts
 *
 * It (1) provisions the four default schemes per org, (2) assigns numbers to
 * existing Request/Product rows that have none (in createdAt order), keeping
 * existing Quote/Project numbers untouched, and (3) seeds each NumberingCounter
 * at the current maximum per period so freshly generated numbers continue without
 * collision or renumbering. Re-running is safe (already-numbered rows are skipped
 * and counters are recomputed to the same value).
 *
 * Reused by `seed.ts` so seeded demo data is fully numbered too.
 */
import { PrismaClient, NumberingModel } from '@prisma/client';
import {
  DEFAULT_SCHEMES,
  NUMBERING_MODELS,
  composeNumber,
  periodKeyFor,
  resolveAffixes,
} from '../src/modules/numbering/numbering.helpers';

const MODEL_NUMBER_FIELD: Record<NumberingModel, string> = {
  REQUEST: 'requestNumber',
  QUOTE: 'quoteNumber',
  PROJECT: 'projectNumber',
  PRODUCT: 'productCode',
  WORK_ORDER: 'workOrderNumber',
};

function delegateFor(prisma: PrismaClient, model: NumberingModel): any {
  switch (model) {
    case 'REQUEST':
      return prisma.request;
    case 'QUOTE':
      return prisma.quote;
    case 'PROJECT':
      return prisma.project;
    case 'PRODUCT':
      return prisma.product;
    case 'WORK_ORDER':
      return prisma.workOrder;
  }
}

/** Parse the numeric sequence out of an existing number using the scheme's format. */
function extractSequence(
  scheme: { model: NumberingModel; prefix: string; suffix: string; digits: number },
  value: string,
  date: Date,
): number | null {
  const { prefix, suffix } = resolveAffixes(scheme, {}, date);
  if (!value.startsWith(prefix)) return null;
  let middle = value.slice(prefix.length);
  if (suffix) {
    if (!middle.endsWith(suffix)) return null;
    middle = middle.slice(0, middle.length - suffix.length);
  }
  const parsed = parseInt(middle, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function backfillNumbering(prisma: PrismaClient): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });

  for (const org of orgs) {
    for (const model of NUMBERING_MODELS) {
      const scheme = await prisma.numberingScheme.upsert({
        where: { orgId_model: { orgId: org.id, model } },
        create: { orgId: org.id, model, ...DEFAULT_SCHEMES[model] },
        update: {},
      });

      const field = MODEL_NUMBER_FIELD[model];
      const delegate = delegateFor(prisma, model);
      const records: Array<{ id: string; createdAt: Date; [k: string]: unknown }> =
        await delegate.findMany({
          where: { orgId: org.id },
          select: { id: true, createdAt: true, [field]: true },
          orderBy: { createdAt: 'asc' },
        });

      // Highest issued value per period → counter seed.
      const maxPerPeriod = new Map<string, number>();
      // Running sequence used when assigning numbers to unnumbered rows.
      const seqPerPeriod = new Map<string, number>();

      for (const rec of records) {
        const date = rec.createdAt;
        const period = periodKeyFor(scheme.resetPolicy, date);
        const current = rec[field] as string | null;

        if (current == null || current === '') {
          const prev = seqPerPeriod.get(period);
          const next = prev == null ? scheme.start : prev + scheme.interval;
          seqPerPeriod.set(period, next);
          const number = composeNumber(scheme, next, {}, date);
          await delegate.update({ where: { id: rec.id }, data: { [field]: number } });
          maxPerPeriod.set(period, Math.max(maxPerPeriod.get(period) ?? -Infinity, next));
        } else {
          const seq = extractSequence(scheme, current, date);
          if (seq != null) {
            maxPerPeriod.set(period, Math.max(maxPerPeriod.get(period) ?? -Infinity, seq));
            seqPerPeriod.set(period, Math.max(seqPerPeriod.get(period) ?? -Infinity, seq));
          }
        }
      }

      for (const [period, max] of maxPerPeriod) {
        if (!Number.isFinite(max)) continue;
        await prisma.numberingCounter.upsert({
          where: { schemeId_periodKey: { schemeId: scheme.id, periodKey: period } },
          create: { schemeId: scheme.id, periodKey: period, value: max },
          update: { value: max },
        });
      }
    }
  }
}

// Standalone CLI entrypoint.
if (require.main === module) {
  const prisma = new PrismaClient();
  backfillNumbering(prisma)
    .then(() => console.log('✅ Numbering backfill complete'))
    .catch((err) => {
      console.error('❌ Numbering backfill failed', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
