/**
 * Backfill van `Finding.isCritical` (PRD-14, online herstel).
 *
 * Herberekent voor ALLE (niet-verwijderde) findings de gedenormaliseerde
 * `isCritical`-vlag op basis van `classificationValues` × de
 * `ClassificationOption.isCritical`-vlaggen van het classificatiemodel van het
 * plan (via `InspectionPlan.inspectionTemplate.classificationModelId`).
 *
 * Gebruik (vanuit apps/api/):
 *   npx ts-node scripts/backfill-finding-is-critical.ts
 *
 * Het script is idempotent en her-runbaar: draai het opnieuw nadat een
 * SUPERUSER classificatie-opties als kritiek (her)markeert, zodat bestaande
 * findings de nieuwe configuratie volgen. Zolang geen enkele optie als kritiek
 * gemarkeerd is, is de uitkomst een no-op (alles false).
 */
import { PrismaClient } from '@prisma/client';
import {
  computeFindingIsCritical,
  type ClassificationModelForCritical,
} from '../src/common/utils/finding-critical';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

async function main() {
  // 1. Alle classificatiemodellen (globaal, klein) → map id → model
  const models = await prisma.classificationModel.findMany({
    include: {
      characteristics: {
        select: { code: true, options: { select: { code: true, isCritical: true } } },
      },
    },
  });
  const modelById = new Map<string, ClassificationModelForCritical>(
    models.map((m) => [m.id, m]),
  );

  // 2. Inspectietemplates → classificationModelId
  const templates = await prisma.inspectionTemplate.findMany({
    select: { id: true, classificationModelId: true },
  });
  const modelIdByTemplate = new Map(templates.map((t) => [t.id, t.classificationModelId]));

  // 3. Plannen → inspectionTemplateId
  const plans = await prisma.inspectionPlan.findMany({
    select: { id: true, inspectionTemplateId: true },
  });
  const templateByPlan = new Map(plans.map((p) => [p.id, p.inspectionTemplateId]));

  let processed = 0;
  let flippedTrue = 0;
  let flippedFalse = 0;
  let cursor: string | undefined;

  for (;;) {
    const findings = await prisma.finding.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        inspectionPlanId: true,
        classificationValues: true,
        isCritical: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (findings.length === 0) break;
    cursor = findings[findings.length - 1].id;
    processed += findings.length;

    const toTrue: string[] = [];
    const toFalse: string[] = [];
    for (const finding of findings) {
      const templateId = templateByPlan.get(finding.inspectionPlanId);
      const model = templateId ? modelById.get(modelIdByTemplate.get(templateId) ?? '') : null;
      const expected = computeFindingIsCritical(finding.classificationValues, model);
      if (expected !== finding.isCritical) {
        (expected ? toTrue : toFalse).push(finding.id);
      }
    }
    if (toTrue.length > 0) {
      await prisma.finding.updateMany({ where: { id: { in: toTrue } }, data: { isCritical: true } });
      flippedTrue += toTrue.length;
    }
    if (toFalse.length > 0) {
      await prisma.finding.updateMany({ where: { id: { in: toFalse } }, data: { isCritical: false } });
      flippedFalse += toFalse.length;
    }
  }

  console.log(
    `Backfill klaar: ${processed} findings verwerkt, ${flippedTrue} → kritiek, ${flippedFalse} → niet-kritiek.`,
  );
}

main()
  .catch((err) => {
    console.error('Backfill mislukt:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
