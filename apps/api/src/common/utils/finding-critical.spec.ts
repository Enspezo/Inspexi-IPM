// Online herstel (PRD-14): unit tests voor de server-owned isCritical-berekening.
// Een finding is kritiek zodra minstens één classificatie-waarde verwijst naar een
// ClassificationOption met isCritical: true in een toepasselijk model. WP-B10
// (B-222) voegt de normtype-fallback en het finding-template-model toe.
import {
  computeFindingIsCritical,
  computeFindingIsCriticalAny,
  loadPlanCriticalModel,
  loadFindingTemplateCriticalModel,
  type ClassificationModelForCritical,
  type PrismaForCriticalModel,
} from './finding-critical';

/** Mock-prisma met alle drie delegates; per test overschrijfbaar. */
function prismaMock(overrides: {
  plan?: unknown;
  normType?: unknown;
  findingTemplate?: unknown;
}): PrismaForCriticalModel & {
  inspectionPlan: { findUnique: jest.Mock };
  normTypeDefinition: { findFirst: jest.Mock };
  findingTemplate: { findUnique: jest.Mock };
} {
  return {
    inspectionPlan: { findUnique: jest.fn().mockResolvedValue(overrides.plan ?? null) },
    normTypeDefinition: { findFirst: jest.fn().mockResolvedValue(overrides.normType ?? null) },
    findingTemplate: {
      findUnique: jest.fn().mockResolvedValue(overrides.findingTemplate ?? null),
    },
  };
}

describe('computeFindingIsCritical', () => {
  const model: ClassificationModelForCritical = {
    characteristics: [
      {
        code: 'SEVERITY',
        options: [
          { code: 'C1', isCritical: true },
          { code: 'C3', isCritical: false },
        ],
      },
      {
        code: 'AARD',
        options: [{ code: 'BRAND', isCritical: false }],
      },
    ],
  };

  it('is true wanneer een waarde naar een isCritical-optie verwijst', () => {
    expect(computeFindingIsCritical({ SEVERITY: 'C1' }, model)).toBe(true);
  });

  it('is true zodra minstens één van meerdere waarden kritiek is', () => {
    expect(computeFindingIsCritical({ AARD: 'BRAND', SEVERITY: 'C1' }, model)).toBe(true);
  });

  it('is false wanneer de optie niet kritiek is', () => {
    expect(computeFindingIsCritical({ SEVERITY: 'C3' }, model)).toBe(false);
  });

  it('is false zonder classificatiemodel (null/undefined)', () => {
    expect(computeFindingIsCritical({ SEVERITY: 'C1' }, null)).toBe(false);
    expect(computeFindingIsCritical({ SEVERITY: 'C1' }, undefined)).toBe(false);
  });

  it('is false bij lege classificationValues', () => {
    expect(computeFindingIsCritical({}, model)).toBe(false);
  });

  it('is false wanneer classificationValues geen object is', () => {
    expect(computeFindingIsCritical(null, model)).toBe(false);
    expect(computeFindingIsCritical('SEVERITY=C1', model)).toBe(false);
    expect(computeFindingIsCritical(42, model)).toBe(false);
  });

  it('is false bij een onbekende characteristic-code', () => {
    expect(computeFindingIsCritical({ ONBEKEND: 'C1' }, model)).toBe(false);
  });

  it('is false bij een onbekende optie-code binnen een bekende characteristic', () => {
    expect(computeFindingIsCritical({ SEVERITY: 'C9' }, model)).toBe(false);
  });

  it('slaat niet-string optiewaarden over (defensief)', () => {
    expect(computeFindingIsCritical({ SEVERITY: 5 }, model)).toBe(false);
  });
});

describe('computeFindingIsCriticalAny (WP-B10)', () => {
  const planModel: ClassificationModelForCritical = {
    characteristics: [{ code: 'SEVERITY', options: [{ code: 'C1', isCritical: false }] }],
  };
  const templateModel: ClassificationModelForCritical = {
    characteristics: [{ code: 'ERNST', options: [{ code: 'X', isCritical: true }] }],
  };

  it('is true zodra ÉÉN van de modellen de waarde als kritiek kent', () => {
    expect(computeFindingIsCriticalAny({ ERNST: 'X' }, [planModel, templateModel])).toBe(true);
  });

  it('is false wanneer geen enkel model de waarde kritiek maakt', () => {
    expect(computeFindingIsCriticalAny({ SEVERITY: 'C1' }, [planModel, templateModel])).toBe(false);
  });

  it('is false zonder modellen', () => {
    expect(computeFindingIsCriticalAny({ SEVERITY: 'C1' }, [])).toBe(false);
    expect(computeFindingIsCriticalAny({ SEVERITY: 'C1' }, [null, undefined])).toBe(false);
  });
});

describe('loadPlanCriticalModel', () => {
  const classificationModel = {
    characteristics: [{ code: 'SEVERITY', options: [{ code: 'C1', isCritical: true }] }],
  };

  it('geeft het classificatiemodel van het inspectie-template terug', async () => {
    const prisma = prismaMock({
      plan: { normTypeCode: 'NEN1010', inspectionTemplate: { classificationModel } },
    });

    await expect(loadPlanCriticalModel(prisma, 'plan-1')).resolves.toEqual(classificationModel);
    expect(prisma.inspectionPlan.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1' } }),
    );
    // Template-model aanwezig → geen normtype-lookup nodig.
    expect(prisma.normTypeDefinition.findFirst).not.toHaveBeenCalled();
  });

  it('valt terug op het standaardmodel van het normtype (WP-B10 · B-222)', async () => {
    const prisma = prismaMock({
      plan: { normTypeCode: 'NEN1010', inspectionTemplate: null },
      normType: { classificationModel },
    });

    await expect(loadPlanCriticalModel(prisma, 'plan-1')).resolves.toEqual(classificationModel);
    expect(prisma.normTypeDefinition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'NEN1010', deletedAt: null } }),
    );
  });

  it('geeft null zonder template-model én zonder normtype-model', async () => {
    const prisma = prismaMock({
      plan: { normTypeCode: 'SCOPE_10', inspectionTemplate: null },
      normType: { classificationModel: null },
    });
    await expect(loadPlanCriticalModel(prisma, 'plan-1')).resolves.toBeNull();

    const prismaMissing = prismaMock({ plan: null });
    await expect(loadPlanCriticalModel(prismaMissing, 'plan-x')).resolves.toBeNull();
    expect(prismaMissing.normTypeDefinition.findFirst).not.toHaveBeenCalled();
  });
});

describe('loadFindingTemplateCriticalModel (WP-B10)', () => {
  const classificationModel = {
    characteristics: [{ code: 'ERNST', options: [{ code: 'X', isCritical: true }] }],
  };

  it('geeft het model van het finding-template terug', async () => {
    const prisma = prismaMock({ findingTemplate: { classificationModel } });
    await expect(loadFindingTemplateCriticalModel(prisma, 'tpl-1')).resolves.toEqual(
      classificationModel,
    );
  });

  it('geeft null zonder template of zonder model', async () => {
    const prisma = prismaMock({ findingTemplate: null });
    await expect(loadFindingTemplateCriticalModel(prisma, 'tpl-1')).resolves.toBeNull();

    const prismaNoModel = prismaMock({ findingTemplate: { classificationModel: null } });
    await expect(loadFindingTemplateCriticalModel(prismaNoModel, 'tpl-2')).resolves.toBeNull();
  });
});
