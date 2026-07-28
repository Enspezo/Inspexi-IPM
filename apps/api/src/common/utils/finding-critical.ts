/**
 * Online herstel (PRD-14): berekening van `Finding.isCritical`.
 *
 * Een finding is kritiek zodra minstens één van zijn classificatie-waarden
 * (`classificationValues`: Record<characteristicCode, optionCode>) verwijst
 * naar een `ClassificationOption` met `isCritical: true` binnen een van de
 * toepasselijke classificatiemodellen van de finding.
 *
 * Toepasselijke modellen (WP-B10 · B-222):
 *  1. het model van het inspectie-template van het plan
 *     (`InspectionPlan.inspectionTemplate.classificationModelId`), met als
 *     fallback het STANDAARDMODEL VAN HET NORMTYPE van het plan
 *     (`NormTypeDefinition.classificationModelId` via `plan.normTypeCode`) —
 *     dezelfde fallback die de PWA gebruikt voor "eigen constateringen";
 *  2. het model van het finding-template (`FindingTemplate.classificationModelId`)
 *     wanneer de finding daarmee is aangemaakt — template-gedreven findings
 *     classificeren tegen dát model.
 *
 * Server-owned: dit veld wordt uitsluitend hier berekend (findings.service,
 * de /sync-push-mapper en het backfill-script) en is niet client-schrijfbaar.
 */

export interface ClassificationModelForCritical {
  characteristics: Array<{
    code: string;
    options: Array<{ code: string; isCritical: boolean }>;
  }>;
}

/** Gedeeld select-fragment: alleen wat de kritikaliteits-/validatielaag nodig heeft. */
const CRITICAL_MODEL_SELECT = {
  characteristics: {
    select: { code: true, options: { select: { code: true, isCritical: true } } },
  },
} as const;

/** Minimale Prisma-vorm die deze loaders nodig hebben (structureel op PrismaService). */
export interface PrismaForCriticalModel {
  inspectionPlan: {
    findUnique(args: {
      where: { id: string };
      select: Record<string, unknown>;
    }): Promise<unknown>;
  };
  normTypeDefinition: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }): Promise<unknown>;
  };
  findingTemplate: {
    findUnique(args: {
      where: { id: string };
      select: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

/**
 * Laadt het classificatiemodel (alleen code + isCritical per optie) van het plan:
 * eerst via `InspectionPlan.inspectionTemplate.classificationModelId`, anders via
 * het standaardmodel van het normtype (`plan.normTypeCode` →
 * `NormTypeDefinition.classificationModelId`). Geen van beide → null (finding
 * kan dan nooit kritiek zijn en codes zijn niet valideerbaar).
 */
export async function loadPlanCriticalModel(
  prisma: PrismaForCriticalModel,
  planId: string,
): Promise<ClassificationModelForCritical | null> {
  const plan = (await prisma.inspectionPlan.findUnique({
    where: { id: planId },
    select: {
      normTypeCode: true,
      inspectionTemplate: {
        select: { classificationModel: { select: CRITICAL_MODEL_SELECT } },
      },
    },
  })) as {
    normTypeCode: string | null;
    inspectionTemplate: { classificationModel: ClassificationModelForCritical | null } | null;
  } | null;

  const templateModel = plan?.inspectionTemplate?.classificationModel ?? null;
  if (templateModel) return templateModel;

  // WP-B10 (B-222): fallback op het standaardmodel van het normtype, zodat ook
  // plannen zonder inspectie-template (of met een template zonder model) een
  // geldig vocabulaire hebben — spiegelbeeld van de PWA-fallback.
  if (!plan?.normTypeCode) return null;
  const normType = (await prisma.normTypeDefinition.findFirst({
    where: { code: plan.normTypeCode, deletedAt: null },
    select: { classificationModel: { select: CRITICAL_MODEL_SELECT } },
  })) as { classificationModel: ClassificationModelForCritical | null } | null;
  return normType?.classificationModel ?? null;
}

/**
 * Laadt het classificatiemodel van een finding-template (WP-B10): een finding
 * dat met een template is aangemaakt classificeert tegen het model van dát
 * template. Geen template of geen model → null.
 */
export async function loadFindingTemplateCriticalModel(
  prisma: PrismaForCriticalModel,
  findingTemplateId: string,
): Promise<ClassificationModelForCritical | null> {
  const template = (await prisma.findingTemplate.findUnique({
    where: { id: findingTemplateId },
    select: { classificationModel: { select: CRITICAL_MODEL_SELECT } },
  })) as { classificationModel: ClassificationModelForCritical | null } | null;
  return template?.classificationModel ?? null;
}

export function computeFindingIsCritical(
  classificationValues: unknown,
  model: ClassificationModelForCritical | null | undefined,
): boolean {
  if (!model || !classificationValues || typeof classificationValues !== 'object') {
    return false;
  }
  for (const [charCode, optionCode] of Object.entries(
    classificationValues as Record<string, unknown>,
  )) {
    if (typeof optionCode !== 'string') continue;
    const characteristic = model.characteristics.find((c) => c.code === charCode);
    const option = characteristic?.options.find((o) => o.code === optionCode);
    if (option?.isCritical) return true;
  }
  return false;
}

/**
 * Multi-model-variant (WP-B10): kritiek zodra een waarde in ÉÉN van de
 * toepasselijke modellen naar een kritieke optie verwijst.
 */
export function computeFindingIsCriticalAny(
  classificationValues: unknown,
  models: Array<ClassificationModelForCritical | null | undefined>,
): boolean {
  return models.some((m) => computeFindingIsCritical(classificationValues, m));
}
