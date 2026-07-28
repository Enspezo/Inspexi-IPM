/**
 * Backfill van `Finding.isCritical` (PRD-14, online herstel).
 *
 * Herberekent voor ALLE (niet-verwijderde) findings de gedenormaliseerde
 * `isCritical`-vlag op basis van `classificationValues` × de
 * `ClassificationOption.isCritical`-vlaggen van de toepasselijke
 * classificatiemodellen (WP-B10, zelfde resolutie als findings.service en de
 * /sync-push): het model van het inspectie-template van het plan, met als
 * fallback het standaardmodel van het NORMTYPE van het plan, plus het model
 * van het finding-template wanneer de finding daarmee is aangemaakt.
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
  computeFindingIsCriticalAny,
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

  // 2b. Normtypes → default-classificationModelId (WP-B10-fallback)
  const normTypes = await prisma.normTypeDefinition.findMany({
    where: { deletedAt: null },
    select: { code: true, classificationModelId: true },
  });
  const modelIdByNormCode = new Map(normTypes.map((n) => [n.code, n.classificationModelId]));

  // 2c. Finding-templates → classificationModelId (template-gedreven findings)
  const findingTemplates = await prisma.findingTemplate.findMany({
    select: { id: true, classificationModelId: true },
  });
  const modelIdByFindingTemplate = new Map(
    findingTemplates.map((t) => [t.id, t.classificationModelId]),
  );

  // 3. Plannen → inspectionTemplateId + normTypeCode
  const plans = await prisma.inspectionPlan.findMany({
    select: { id: true, inspectionTemplateId: true, normTypeCode: true },
  });
  const planById = new Map(plans.map((p) => [p.id, p]));

  /** Plan-model: inspectie-template → normtype-fallback (zoals loadPlanCriticalModel). */
  const planModelFor = (planId: string): ClassificationModelForCritical | null => {
    const plan = planById.get(planId);
    if (!plan) return null;
    const templateModelId = plan.inspectionTemplateId
      ? modelIdByTemplate.get(plan.inspectionTemplateId)
      : null;
    if (templateModelId) return modelById.get(templateModelId) ?? null;
    const normModelId = modelIdByNormCode.get(plan.normTypeCode);
    return normModelId ? (modelById.get(normModelId) ?? null) : null;
  };

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
        findingTemplateId: true,
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
      const models: Array<ClassificationModelForCritical | null> = [
        planModelFor(finding.inspectionPlanId),
      ];
      if (finding.findingTemplateId) {
        const tplModelId = modelIdByFindingTemplate.get(finding.findingTemplateId);
        models.push(tplModelId ? (modelById.get(tplModelId) ?? null) : null);
      }
      const expected = computeFindingIsCriticalAny(finding.classificationValues, models);
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
