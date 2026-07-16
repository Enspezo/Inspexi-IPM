import { AvailabilityExceptionType } from '@prisma/client';
import {
  mergeIntervals,
  subtractIntervals,
  intersectIntervals,
  expandOneOff,
  expandRecurring,
  expandException,
  resolveDay,
  isoWeekday,
  mondayOf,
  diffDays,
  eachDateKey,
  dateKeyOf,
  Interval,
  ExceptionLike,
} from './availability-resolution.helpers';

/** UTC-datum als timestamp (voor startsAt/endsAt). */
const ts = (y: number, mo: number, d: number, h = 0, mi = 0): Date =>
  new Date(Date.UTC(y, mo - 1, d, h, mi));
/** UTC-middernacht (voor @db.Date-velden). */
const day = (y: number, mo: number, d: number): Date => new Date(Date.UTC(y, mo - 1, d));

function oneOff(partial: Partial<ExceptionLike>): ExceptionLike {
  return {
    id: 'exc',
    type: AvailabilityExceptionType.GEBLOKKEERD,
    startsAt: null,
    endsAt: null,
    allDay: false,
    isRecurring: false,
    weekdays: [],
    startMinute: null,
    endMinute: null,
    intervalWeeks: 1,
    recurStartDate: null,
    recurEndDate: null,
    ...partial,
  };
}

function recurring(partial: Partial<ExceptionLike>): ExceptionLike {
  return oneOff({ isRecurring: true, ...partial });
}

describe('mergeIntervals', () => {
  it('sorteert en laat losse intervallen ongemoeid', () => {
    expect(
      mergeIntervals([
        { startMinute: 600, endMinute: 700 },
        { startMinute: 100, endMinute: 200 },
      ]),
    ).toEqual([
      { startMinute: 100, endMinute: 200 },
      { startMinute: 600, endMinute: 700 },
    ]);
  });

  it('voegt overlappende intervallen samen', () => {
    expect(
      mergeIntervals([
        { startMinute: 100, endMinute: 300 },
        { startMinute: 200, endMinute: 400 },
      ]),
    ).toEqual([{ startMinute: 100, endMinute: 400 }]);
  });

  it('voegt aangrenzende (rakende) intervallen samen', () => {
    expect(
      mergeIntervals([
        { startMinute: 100, endMinute: 200 },
        { startMinute: 200, endMinute: 300 },
      ]),
    ).toEqual([{ startMinute: 100, endMinute: 300 }]);
  });

  it('verwijdert lege/inverse intervallen', () => {
    expect(
      mergeIntervals([
        { startMinute: 200, endMinute: 200 },
        { startMinute: 500, endMinute: 400 },
      ]),
    ).toEqual([]);
  });

  it('absorbeert een volledig omvat interval', () => {
    expect(
      mergeIntervals([
        { startMinute: 0, endMinute: 1440 },
        { startMinute: 480, endMinute: 1050 },
      ]),
    ).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  });

  it('geeft een lege lijst voor lege input', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe('subtractIntervals', () => {
  it('snijdt een blokkade uit het midden (splitst)', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 600, endMinute: 700 }]),
    ).toEqual([
      { startMinute: 480, endMinute: 600 },
      { startMinute: 700, endMinute: 1050 },
    ]);
  });

  it('snijdt aan de linkerrand', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 400, endMinute: 600 }]),
    ).toEqual([{ startMinute: 600, endMinute: 1050 }]);
  });

  it('snijdt aan de rechterrand', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 900, endMinute: 1200 }]),
    ).toEqual([{ startMinute: 480, endMinute: 900 }]);
  });

  it('een volledig omvattende blokkade wist alles', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 0, endMinute: 1440 }]),
    ).toEqual([]);
  });

  it('een niet-overlappende blokkade laat de basis ongemoeid', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 1100, endMinute: 1200 }]),
    ).toEqual([{ startMinute: 480, endMinute: 1050 }]);
  });

  it('rakende blokkade (end == start) verandert niets', () => {
    expect(
      subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 1050, endMinute: 1200 }]),
    ).toEqual([{ startMinute: 480, endMinute: 1050 }]);
  });

  it('lege blokkade-lijst → basis blijft', () => {
    expect(subtractIntervals([{ startMinute: 480, endMinute: 1050 }], [])).toEqual([
      { startMinute: 480, endMinute: 1050 },
    ]);
  });

  it('meerdere blokkades knippen meerdere gaten', () => {
    expect(
      subtractIntervals(
        [{ startMinute: 0, endMinute: 1440 }],
        [
          { startMinute: 300, endMinute: 400 },
          { startMinute: 800, endMinute: 900 },
        ],
      ),
    ).toEqual([
      { startMinute: 0, endMinute: 300 },
      { startMinute: 400, endMinute: 800 },
      { startMinute: 900, endMinute: 1440 },
    ]);
  });
});

describe('intersectIntervals', () => {
  it('levert de overlap', () => {
    expect(
      intersectIntervals([{ startMinute: 480, endMinute: 1050 }], [{ startMinute: 600, endMinute: 1200 }]),
    ).toEqual([{ startMinute: 600, endMinute: 1050 }]);
  });

  it('geen overlap → leeg', () => {
    expect(
      intersectIntervals([{ startMinute: 0, endMinute: 300 }], [{ startMinute: 400, endMinute: 500 }]),
    ).toEqual([]);
  });
});

describe('date-key helpers', () => {
  it('isoWeekday: maandag = 1, zondag = 7', () => {
    expect(isoWeekday('2026-07-20')).toBe(1); // maandag
    expect(isoWeekday('2026-07-26')).toBe(7); // zondag
  });

  it('mondayOf: normaliseert naar de maandag van de week', () => {
    expect(mondayOf('2026-07-22')).toBe('2026-07-20'); // wo → ma
    expect(mondayOf('2026-07-26')).toBe('2026-07-20'); // zo → dezelfde week-maandag
    expect(mondayOf('2026-07-27')).toBe('2026-07-27'); // ma → zichzelf
  });

  it('diffDays telt hele dagen over een weekgrens (zo → ma)', () => {
    expect(diffDays('2026-07-26', '2026-07-27')).toBe(1);
    expect(diffDays('2026-07-20', '2026-07-27')).toBe(7);
  });

  it('eachDateKey is inclusief aan beide zijden', () => {
    expect(eachDateKey('2026-07-20', '2026-07-22')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ]);
  });

  it('eachDateKey overbrugt een maandgrens correct', () => {
    expect(eachDateKey('2026-07-31', '2026-08-02')).toEqual([
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });
});

describe('expandOneOff', () => {
  it('deeltijdvenster op dezelfde dag → geknipte minuten', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 9), endsAt: ts(2026, 7, 20, 12) });
    expect(expandOneOff(exc, '2026-07-20')).toEqual([{ startMinute: 540, endMinute: 720 }]);
  });

  it('exclusief einde: 12:00 valt buiten (raakt 12:00 niet)', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 9), endsAt: ts(2026, 7, 20, 12) });
    const [iv] = expandOneOff(exc, '2026-07-20');
    expect(iv.endMinute).toBe(720); // exact 12:00, halfopen
  });

  it('meerdaags bereik: eerste dag vanaf begintijd tot einde dag', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 14), endsAt: ts(2026, 7, 22, 10) });
    expect(expandOneOff(exc, '2026-07-20')).toEqual([{ startMinute: 840, endMinute: 1440 }]);
  });

  it('meerdaags bereik: middendag volledig', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 14), endsAt: ts(2026, 7, 22, 10) });
    expect(expandOneOff(exc, '2026-07-21')).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  });

  it('meerdaags bereik: laatste dag tot eindtijd', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 14), endsAt: ts(2026, 7, 22, 10) });
    expect(expandOneOff(exc, '2026-07-22')).toEqual([{ startMinute: 0, endMinute: 600 }]);
  });

  it('dag buiten het bereik → leeg', () => {
    const exc = oneOff({ startsAt: ts(2026, 7, 20, 14), endsAt: ts(2026, 7, 22, 10) });
    expect(expandOneOff(exc, '2026-07-23')).toEqual([]);
  });

  it('allDay: hele dag ongeacht de tijden, exclusief einde op middernacht', () => {
    const exc = oneOff({ allDay: true, startsAt: ts(2026, 8, 3), endsAt: ts(2026, 8, 15) });
    expect(expandOneOff(exc, '2026-08-03')).toEqual([{ startMinute: 0, endMinute: 1440 }]);
    expect(expandOneOff(exc, '2026-08-14')).toEqual([{ startMinute: 0, endMinute: 1440 }]);
    // 15 aug is exclusief einde (00:00) → niet geblokkeerd
    expect(expandOneOff(exc, '2026-08-15')).toEqual([]);
  });

  it('ontbrekende timestamps → leeg', () => {
    expect(expandOneOff(oneOff({ startsAt: ts(2026, 7, 20), endsAt: null }), '2026-07-20')).toEqual([]);
  });
});

describe('expandRecurring', () => {
  const base = recurring({
    weekdays: [1], // maandag
    startMinute: 60, // 01:00
    endMinute: 300, // 05:00
    recurStartDate: day(2026, 7, 6), // maandag
  });

  it('matcht de juiste weekdag', () => {
    expect(expandRecurring(base, '2026-07-06')).toEqual([{ startMinute: 60, endMinute: 300 }]); // ma
    expect(expandRecurring(base, '2026-07-07')).toEqual([]); // di
  });

  it('vóór recurStartDate → leeg', () => {
    expect(expandRecurring(base, '2026-06-29')).toEqual([]); // eerdere maandag
  });

  it('recurEndDate is inclusief (t/m)', () => {
    const exc = recurring({ ...base, recurEndDate: day(2026, 7, 13) });
    expect(expandRecurring(exc, '2026-07-13')).toEqual([{ startMinute: 60, endMinute: 300 }]); // t/m-dag zelf
    expect(expandRecurring(exc, '2026-07-20')).toEqual([]); // week erna
  });

  it('intervalWeeks = 1 matcht elke week', () => {
    expect(expandRecurring(base, '2026-07-06')).not.toEqual([]);
    expect(expandRecurring(base, '2026-07-13')).not.toEqual([]);
    expect(expandRecurring(base, '2026-07-20')).not.toEqual([]);
  });

  it('intervalWeeks = 2 matcht om de week', () => {
    const exc = recurring({ ...base, intervalWeeks: 2 });
    expect(expandRecurring(exc, '2026-07-06')).not.toEqual([]); // week 0
    expect(expandRecurring(exc, '2026-07-13')).toEqual([]); // week 1
    expect(expandRecurring(exc, '2026-07-20')).not.toEqual([]); // week 2
  });

  it('intervalWeeks = 2 met recurStartDate midden in de week telt vanaf de week-maandag', () => {
    // recurStartDate op woensdag; de weekdag is maandag → eerste match is de
    // maandag ná de startdatum (zelfde ISO-week telt als week 0).
    const exc = recurring({
      weekdays: [3], // woensdag
      startMinute: 480,
      endMinute: 960,
      intervalWeeks: 2,
      recurStartDate: day(2026, 7, 8), // woensdag = week 0
    });
    expect(expandRecurring(exc, '2026-07-08')).not.toEqual([]); // week 0 (wo)
    expect(expandRecurring(exc, '2026-07-15')).toEqual([]); // week 1
    expect(expandRecurring(exc, '2026-07-22')).not.toEqual([]); // week 2
  });

  it('allDay herhalend → hele dag', () => {
    const exc = recurring({
      weekdays: [1],
      allDay: true,
      startMinute: null,
      endMinute: null,
      recurStartDate: day(2026, 7, 6),
    });
    expect(expandRecurring(exc, '2026-07-06')).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  });

  it('zonder recurStartDate → leeg', () => {
    expect(expandRecurring(recurring({ weekdays: [1], recurStartDate: null }), '2026-07-06')).toEqual([]);
  });
});

describe('expandException dispatch', () => {
  it('kiest eenmalig vs herhalend op isRecurring', () => {
    const once = oneOff({ startsAt: ts(2026, 7, 20, 9), endsAt: ts(2026, 7, 20, 12) });
    const weekly = recurring({ weekdays: [1], startMinute: 60, endMinute: 300, recurStartDate: day(2026, 7, 20) });
    expect(expandException(once, '2026-07-20')).toEqual([{ startMinute: 540, endMinute: 720 }]);
    expect(expandException(weekly, '2026-07-20')).toEqual([{ startMinute: 60, endMinute: 300 }]);
  });
});

describe('resolveDay', () => {
  const workday: Interval[] = [{ startMinute: 480, endMinute: 1050 }]; // 08:00–17:30

  it('baseline zonder excepties blijft ongewijzigd', () => {
    expect(resolveDay(workday, [], [])).toEqual(workday);
  });

  it('freelancer-baseline (leeg) zonder plus → leeg', () => {
    expect(resolveDay([], [], [])).toEqual([]);
  });

  it('freelancer met BESCHIKBAAR-exceptie → gevuld', () => {
    expect(resolveDay([], [{ startMinute: 540, endMinute: 960 }], [])).toEqual([
      { startMinute: 540, endMinute: 960 },
    ]);
  });

  it('precedentie: GEBLOKKEERD wint van toegevoegde BESCHIKBAAR', () => {
    // Baseline leeg, plus 09:00–16:00, minus 10:00–12:00 → gat.
    expect(
      resolveDay([], [{ startMinute: 540, endMinute: 960 }], [{ startMinute: 600, endMinute: 720 }]),
    ).toEqual([
      { startMinute: 540, endMinute: 600 },
      { startMinute: 720, endMinute: 960 },
    ]);
  });

  it('blokkade over de baseline heen snijdt de werkdag', () => {
    expect(resolveDay(workday, [], [{ startMinute: 780, endMinute: 1050 }])).toEqual([
      { startMinute: 480, endMinute: 780 },
    ]);
  });

  it('hele-dag-blokkade wist de werkdag volledig', () => {
    expect(resolveDay(workday, [], [{ startMinute: 0, endMinute: 1440 }])).toEqual([]);
  });

  it('plus breidt de baseline uit (union), daarna trekt minus af', () => {
    // Baseline 08:00–17:30, extra beschikbaar 17:30–19:00, blokkade 12:00–13:00.
    expect(
      resolveDay(
        workday,
        [{ startMinute: 1050, endMinute: 1140 }],
        [{ startMinute: 720, endMinute: 780 }],
      ),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 780, endMinute: 1140 },
    ]);
  });
});
