// Gedeelde severity-detectie (PRD-14 refactor): unit tests voor getMainClassification.
// Gebruikt door document-generatie én de herstel-samenvatting (client-repair).
import {
  getMainClassification,
  findSeverityCharacteristicCode,
  type SeverityClassificationModel,
} from './classification-severity';

describe('findSeverityCharacteristicCode', () => {
  it('kiest een bekende severity-key boven de eerste key', () => {
    expect(findSeverityCharacteristicCode({ AARD: 'x', SEVERITY: 'C1' })).toBe('SEVERITY');
    expect(findSeverityCharacteristicCode({ AARD: 'x', RISICO: 'A' })).toBe('RISICO');
    expect(findSeverityCharacteristicCode({ CLASSIFICATIE: '1', AARD: 'x' })).toBe('CLASSIFICATIE');
  });

  it('matcht case-insensitief op de key', () => {
    expect(findSeverityCharacteristicCode({ eerste: 'x', prioriteit: 'B' })).toBe('prioriteit');
  });

  it('valt terug op de eerste key zonder severity-key', () => {
    expect(findSeverityCharacteristicCode({ AARD: 'x', LOCATIE: 'y' })).toBe('AARD');
  });
});

describe('getMainClassification', () => {
  const model: SeverityClassificationModel = {
    characteristics: [
      {
        code: 'SEVERITY',
        options: [
          { code: 'C1', name: 'Kritiek defect', color: '#112233', isCritical: true },
          { code: 'C3', name: 'Gering defect', color: '#445566' }, // geen isCritical-vlag
        ],
      },
      {
        code: 'AARD',
        options: [{ code: 'BRAND', name: 'Brandgevaar', color: '#778899', isCritical: false }],
      },
    ],
  };

  it('kiest de SEVERITY-key boven de eerste key en resolvet label+kleur+isCritical uit het model', () => {
    const result = getMainClassification({ AARD: 'BRAND', SEVERITY: 'C1' }, model);

    expect(result).toEqual({
      code: 'C1',
      name: 'Kritiek defect',
      color: '#112233',
      isCritical: true,
    });
  });

  it('isCritical is false wanneer de optie de vlag mist', () => {
    const result = getMainClassification({ SEVERITY: 'C3' }, model);

    expect(result).toEqual({
      code: 'C3',
      name: 'Gering defect',
      color: '#445566',
      isCritical: false,
    });
  });

  it('matcht de severity-key case-insensitief (fallback-pad zonder model)', () => {
    // Lowercase 'risico' wordt als severity-key herkend; zonder model levert de
    // bekende code 'A' de default-kleur.
    const result = getMainClassification({ eerste: 'x', risico: 'A' }, null);

    expect(result).toEqual({ code: 'A', name: 'A', color: '#dc2626', isCritical: false });
  });

  it("valt terug op default-kleuren voor bekende codes zonder model ('A' → '#dc2626')", () => {
    expect(getMainClassification({ SEVERITY: 'A' }, null).color).toBe('#dc2626');
    expect(getMainClassification({ SEVERITY: '4' }, null).color).toBe('#16a34a');
  });

  it('valt terug op grijs + code-als-label voor onbekende codes', () => {
    const result = getMainClassification({ SEVERITY: 'ZZZ' }, null);

    expect(result).toEqual({ code: 'ZZZ', name: 'ZZZ', color: '#666666', isCritical: false });
  });

  it('valt terug op de default-kleur wanneer het model de optie niet kent', () => {
    // Model aanwezig, maar code 'B' zit niet in de SEVERITY-opties → fallback-pad.
    const result = getMainClassification({ SEVERITY: 'B' }, model);

    expect(result).toEqual({ code: 'B', name: 'B', color: '#ea580c', isCritical: false });
  });

  it("geeft 'Niet geclassificeerd' voor lege of ontbrekende values", () => {
    const expected = {
      code: '-',
      name: 'Niet geclassificeerd',
      color: '#666666',
      isCritical: false,
    };
    expect(getMainClassification({}, model)).toEqual(expected);
    expect(getMainClassification(null, model)).toEqual(expected);
  });

  it('gebruikt de eerste key wanneer er geen severity-key aanwezig is', () => {
    const result = getMainClassification({ AARD: 'BRAND' }, model);

    expect(result).toEqual({
      code: 'BRAND',
      name: 'Brandgevaar',
      color: '#778899',
      isCritical: false,
    });
  });
});
