import {
  computeCalibrationStatus,
  addMonths,
  DEFAULT_CALIBRATION_WARN_DAYS,
} from './calibration-status';

describe('computeCalibrationStatus', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');
  const daysFromNow = (d: number) =>
    new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  it('geeft GEEN_KALIBRATIE zonder laatste kalibratie', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: null, nextCalibrationDue: null },
        30,
        now,
      ),
    ).toBe('GEEN_KALIBRATIE');
  });

  it('geeft GELDIG met kalibratie maar zonder verloopdatum', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: daysFromNow(-100), nextCalibrationDue: null },
        30,
        now,
      ),
    ).toBe('GELDIG');
  });

  it('geeft GELDIG ruim vóór verloop', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: daysFromNow(-30), nextCalibrationDue: daysFromNow(60) },
        30,
        now,
      ),
    ).toBe('GELDIG');
  });

  it('geeft BINNENKORT exact op de drempel', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: daysFromNow(-1), nextCalibrationDue: daysFromNow(30) },
        30,
        now,
      ),
    ).toBe('BINNENKORT');
  });

  it('geeft BINNENKORT op de verloopdag zelf (diff 0)', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: daysFromNow(-1), nextCalibrationDue: now },
        30,
        now,
      ),
    ).toBe('BINNENKORT');
  });

  it('geeft VERLOPEN ruim na de verloopdatum', () => {
    expect(
      computeCalibrationStatus(
        { lastCalibrationDate: daysFromNow(-400), nextCalibrationDue: daysFromNow(-2) },
        30,
        now,
      ),
    ).toBe('VERLOPEN');
  });

  it('honoreert een afwijkende drempel', () => {
    const dates = {
      lastCalibrationDate: daysFromNow(-1),
      nextCalibrationDue: daysFromNow(45),
    };
    expect(computeCalibrationStatus(dates, 30, now)).toBe('GELDIG');
    expect(computeCalibrationStatus(dates, 60, now)).toBe('BINNENKORT');
  });

  it('accepteert ISO-strings', () => {
    expect(
      computeCalibrationStatus(
        {
          lastCalibrationDate: '2026-01-01',
          nextCalibrationDue: '2026-07-01',
        },
        30,
        now,
      ),
    ).toBe('BINNENKORT'); // 6 dagen na `now`
  });

  it('default-drempel is 30 dagen', () => {
    expect(DEFAULT_CALIBRATION_WARN_DAYS).toBe(30);
  });
});

describe('addMonths', () => {
  it('telt maanden op', () => {
    expect(addMonths(new Date('2026-06-15T00:00:00Z'), 12).toISOString()).toBe(
      new Date('2027-06-15T00:00:00Z').toISOString(),
    );
  });

  it('clampt naar eind van de maand', () => {
    // 31 jan + 1 mnd → 28 feb (2026 is geen schrikkeljaar)
    const r = addMonths(new Date('2026-01-31T00:00:00Z'), 1);
    expect(r.getUTCMonth()).toBe(1); // februari
    expect(r.getUTCDate()).toBe(28);
  });

  it('muteert de input niet', () => {
    const input = new Date('2026-06-15T00:00:00Z');
    addMonths(input, 6);
    expect(input.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});
