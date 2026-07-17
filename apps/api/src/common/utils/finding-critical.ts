/**
 * Online herstel (PRD-14): berekening van `Finding.isCritical`.
 *
 * Een finding is kritiek zodra minstens één van zijn classificatie-waarden
 * (`classificationValues`: Record<characteristicCode, optionCode>) verwijst
 * naar een `ClassificationOption` met `isCritical: true` binnen het
 * classificatiemodel van het plan (via `InspectionPlan.inspectionTemplate`).
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

/**
 * Laadt het classificatiemodel (alleen code + isCritical per optie) van het plan
 * via `InspectionPlan.inspectionTemplate.classificationModelId`. Geen template of
 * model → null (finding kan dan nooit kritiek zijn).
 */
export async function loadPlanCriticalModel(
  prisma: {
    inspectionPlan: {
      findUnique(args: {
        where: { id: string };
        select: Record<string, unknown>;
      }): Promise<unknown>;
    };
  },
  planId: string,
): Promise<ClassificationModelForCritical | null> {
  const plan = (await prisma.inspectionPlan.findUnique({
    where: { id: planId },
    select: {
      inspectionTemplate: {
        select: {
          classificationModel: {
            select: {
              characteristics: {
                select: { code: true, options: { select: { code: true, isCritical: true } } },
              },
            },
          },
        },
      },
    },
  })) as {
    inspectionTemplate: { classificationModel: ClassificationModelForCritical | null } | null;
  } | null;
  return plan?.inspectionTemplate?.classificationModel ?? null;
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
