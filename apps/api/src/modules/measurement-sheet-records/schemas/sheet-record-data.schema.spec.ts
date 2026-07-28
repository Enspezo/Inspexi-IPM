// WP-D2 (B-205 deel 2): het canonieke datavorm-schema voor MeasurementSheetRecord.data.
// Geldige vorm: { [sectionCode]: { [rijnummer]: { [fieldCode]: { value, passFail? } } } }
// (+ gereserveerde __-metadata). De verouderde PWA-vorm ({ sections: … }) wordt afgewezen.

import { sheetRecordDataSchema } from './sheet-record-data.schema';

describe('sheetRecordDataSchema (canonieke vorm, WP-D2)', () => {
  const valid = {
    isolation: {
      '0': {
        group: { value: 'Groep 1', passFail: null },
        r_iso: { value: 210.5, passFail: 'pass' },
      },
      '1': {
        group: { value: 'Groep 3', passFail: null },
        r_iso: { value: 0.3, passFail: 'fail' },
      },
    },
  };

  it('accepteert de canonieke servervorm', () => {
    expect(sheetRecordDataSchema.safeParse(valid).success).toBe(true);
  });

  it('accepteert een leeg object (initiële data)', () => {
    expect(sheetRecordDataSchema.safeParse({}).success).toBe(true);
  });

  it('accepteert lege secties en rijen zonder velden', () => {
    expect(
      sheetRecordDataSchema.safeParse({ isolation: {}, visual: { '0': {} } }).success,
    ).toBe(true);
  });

  it('accepteert value: null en ontbrekende passFail', () => {
    expect(
      sheetRecordDataSchema.safeParse({
        isolation: { '0': { r_iso: { value: null } } },
      }).success,
    ).toBe(true);
  });

  it('accepteert niet-primitieve values (bv. foto-id-arrays)', () => {
    expect(
      sheetRecordDataSchema.safeParse({
        visual: { '0': { photos: { value: ['id-1', 'id-2'], passFail: null } } },
      }).success,
    ).toBe(true);
  });

  it('accepteert de gereserveerde __usedInstrumentsSnapshot-metadata', () => {
    expect(
      sheetRecordDataSchema.safeParse({
        ...valid,
        __usedInstrumentsSnapshot: [{ id: 'x', code: 'MM-001' }],
      }).success,
    ).toBe(true);
  });

  it('wijst niet-objecten af (top-level vorm)', () => {
    expect(sheetRecordDataSchema.safeParse([]).success).toBe(false);
    expect(sheetRecordDataSchema.safeParse('x').success).toBe(false);
    expect(sheetRecordDataSchema.safeParse(null).success).toBe(false);
  });

  it("wijst de verouderde PWA-vorm ({ sections: { rows: [...] } }) af met een gerichte melding", () => {
    const result = sheetRecordDataSchema.safeParse({
      sections: { isolation: { rows: [{ r_iso: 2.5, group: 'Groep 1' }] } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('verouderde app-vorm');
    }
  });

  it("wijst de verouderde PWA-vorm ({ sections: { values: {...} } }) af", () => {
    expect(
      sheetRecordDataSchema.safeParse({
        sections: { checks: { values: { ok: true } } },
      }).success,
    ).toBe(false);
  });

  it('wijst de gemengde vorm (serverkeys + sections-wrapper) af', () => {
    expect(
      sheetRecordDataSchema.safeParse({
        ...valid,
        sections: { isolation: { rows: [] } },
      }).success,
    ).toBe(false);
  });

  it('wijst niet-numerieke rij-sleutels af', () => {
    const result = sheetRecordDataSchema.safeParse({
      isolation: { rows: { r_iso: { value: 1 } } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("rij-sleutel 'rows'");
    }
  });

  it('wijst een sectie af die geen object is', () => {
    expect(sheetRecordDataSchema.safeParse({ isolation: [1, 2] }).success).toBe(false);
    expect(sheetRecordDataSchema.safeParse({ isolation: 'x' }).success).toBe(false);
  });

  it('wijst platte veldwaarden af (leaf zonder { value }-wrapper)', () => {
    const result = sheetRecordDataSchema.safeParse({
      isolation: { '0': { r_iso: 2.5 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('{ value, passFail? }');
    }
  });

  it("wijst een leaf-object zonder 'value'-sleutel af", () => {
    expect(
      sheetRecordDataSchema.safeParse({
        isolation: { '0': { r_iso: { passFail: 'pass' } } },
      }).success,
    ).toBe(false);
  });

  it('wijst een ongeldige passFail-waarde af', () => {
    expect(
      sheetRecordDataSchema.safeParse({
        isolation: { '0': { r_iso: { value: 1, passFail: 'ok' } } },
      }).success,
    ).toBe(false);
  });
});
