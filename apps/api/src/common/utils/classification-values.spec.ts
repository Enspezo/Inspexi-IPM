// WP-B10 (B-222): unit tests voor de semantische classificationValues-validatie.
// Geldige codes passeren; onbekende kenmerk-/optiecodes geven een NL-fout;
// zonder bruikbaar model valt er niets te valideren (permissief, gedocumenteerd).
import { BadRequestException } from '@nestjs/common';
import {
  findClassificationValueIssues,
  formatClassificationValueIssues,
  assertClassificationValuesKnown,
} from './classification-values';
import type { ClassificationModelForCritical } from './finding-critical';

const planModel: ClassificationModelForCritical = {
  characteristics: [
    {
      code: 'SEVERITY',
      options: [
        { code: 'C1', isCritical: true },
        { code: 'C3', isCritical: false },
      ],
    },
  ],
};

const templateModel: ClassificationModelForCritical = {
  characteristics: [{ code: 'ERNST', options: [{ code: 'X', isCritical: false }] }],
};

describe('findClassificationValueIssues', () => {
  it('geeft geen issues voor geldige codes uit het plan-model', () => {
    expect(findClassificationValueIssues({ SEVERITY: 'C1' }, [planModel])).toEqual([]);
  });

  it('accepteert codes uit ELK toepasselijk model (plan + finding-template)', () => {
    expect(
      findClassificationValueIssues({ ERNST: 'X' }, [planModel, templateModel]),
    ).toEqual([]);
  });

  it('markeert een onbekend kenmerk (het B-222-vocabulaire {"risico":"kritiek"})', () => {
    expect(findClassificationValueIssues({ risico: 'kritiek' }, [planModel])).toEqual([
      { reason: 'unknown_characteristic', characteristicCode: 'risico' },
    ]);
  });

  it('markeert een onbekende optie binnen een bekend kenmerk', () => {
    expect(findClassificationValueIssues({ SEVERITY: 'C9' }, [planModel])).toEqual([
      { reason: 'unknown_option', characteristicCode: 'SEVERITY', optionCode: 'C9' },
    ]);
  });

  it('eist kenmerk én optie in HETZELFDE model (geen kruisbestuiving)', () => {
    // 'SEVERITY' bestaat alleen in planModel; optie 'X' alleen in templateModel.
    expect(
      findClassificationValueIssues({ SEVERITY: 'X' }, [planModel, templateModel]),
    ).toEqual([{ reason: 'unknown_option', characteristicCode: 'SEVERITY', optionCode: 'X' }]);
  });

  it('markeert lege of niet-string waarden als ongeldig', () => {
    expect(findClassificationValueIssues({ SEVERITY: '' }, [planModel])).toEqual([
      { reason: 'invalid_value', characteristicCode: 'SEVERITY' },
    ]);
    expect(findClassificationValueIssues({ SEVERITY: 5 }, [planModel])).toEqual([
      { reason: 'invalid_value', characteristicCode: 'SEVERITY' },
    ]);
  });

  it('valideert niet zonder bruikbaar model (geen vocabulaire beschikbaar)', () => {
    expect(findClassificationValueIssues({ risico: 'kritiek' }, [])).toEqual([]);
    expect(findClassificationValueIssues({ risico: 'kritiek' }, [null, undefined])).toEqual([]);
    // Model zonder kenmerken telt niet als bruikbaar.
    expect(
      findClassificationValueIssues({ risico: 'kritiek' }, [{ characteristics: [] }]),
    ).toEqual([]);
  });

  it('geeft geen issues voor lege of niet-object waarden (vorm = Zod-laag)', () => {
    expect(findClassificationValueIssues({}, [planModel])).toEqual([]);
    expect(findClassificationValueIssues(null, [planModel])).toEqual([]);
    expect(findClassificationValueIssues('SEVERITY=C1', [planModel])).toEqual([]);
    expect(findClassificationValueIssues(['C1'], [planModel])).toEqual([]);
  });
});

describe('formatClassificationValueIssues', () => {
  it('formatteert alle issue-soorten in het Nederlands', () => {
    const text = formatClassificationValueIssues([
      { reason: 'unknown_characteristic', characteristicCode: 'risico' },
      { reason: 'unknown_option', characteristicCode: 'SEVERITY', optionCode: 'C9' },
      { reason: 'invalid_value', characteristicCode: 'AARD' },
    ]);
    expect(text).toBe(
      "kenmerk 'risico' bestaat niet in het classificatiemodel; " +
        "optie 'C9' is onbekend voor kenmerk 'SEVERITY'; " +
        "waarde voor kenmerk 'AARD' is ongeldig",
    );
  });
});

describe('assertClassificationValuesKnown', () => {
  it('laat geldige waarden door', () => {
    expect(() =>
      assertClassificationValuesKnown({ SEVERITY: 'C3' }, [planModel]),
    ).not.toThrow();
  });

  it('gooit een NL-BadRequest bij onbekende codes', () => {
    expect(() => assertClassificationValuesKnown({ risico: 'kritiek' }, [planModel])).toThrow(
      BadRequestException,
    );
    try {
      assertClassificationValuesKnown({ risico: 'kritiek' }, [planModel]);
    } catch (e) {
      expect((e as BadRequestException).message).toContain(
        "kenmerk 'risico' bestaat niet in het classificatiemodel",
      );
      expect((e as BadRequestException).message).toContain('Classificatie ongeldig');
    }
  });

  it('gooit niet zonder bruikbaar model', () => {
    expect(() => assertClassificationValuesKnown({ risico: 'kritiek' }, [null])).not.toThrow();
  });
});
