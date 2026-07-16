// Online herstel (PRD-14): unit tests voor de server-owned isCritical-berekening.
// Een finding is kritiek zodra minstens één classificatie-waarde verwijst naar een
// ClassificationOption met isCritical: true in het model van het plan.
import {
  computeFindingIsCritical,
  loadPlanCriticalModel,
  type ClassificationModelForCritical,
} from './finding-critical';

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

describe('loadPlanCriticalModel', () => {
  it('geeft het classificatiemodel van het plan terug', async () => {
    const classificationModel = {
      characteristics: [{ code: 'SEVERITY', options: [{ code: 'C1', isCritical: true }] }],
    };
    const prisma = {
      inspectionPlan: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ inspectionTemplate: { classificationModel } }),
      },
    };

    await expect(loadPlanCriticalModel(prisma, 'plan-1')).resolves.toEqual(classificationModel);
    expect(prisma.inspectionPlan.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-1' } }),
    );
  });

  it('geeft null zonder template of model (finding kan dan nooit kritiek zijn)', async () => {
    const prisma = {
      inspectionPlan: { findUnique: jest.fn().mockResolvedValue({ inspectionTemplate: null }) },
    };
    await expect(loadPlanCriticalModel(prisma, 'plan-1')).resolves.toBeNull();

    const prismaMissing = {
      inspectionPlan: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(loadPlanCriticalModel(prismaMissing, 'plan-x')).resolves.toBeNull();
  });
});
