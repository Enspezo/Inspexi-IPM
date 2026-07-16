import { BadRequestException } from '@nestjs/common';
import { AvailabilityExceptionType, Prisma } from '@prisma/client';

/**
 * Genormaliseerde, tijdzone-onafhankelijke invoer voor een uitzondering. Datums
 * zijn ISO-strings (of null); de validatie en Prisma-mapping wonen hier zodat
 * create én update precies dezelfde regels delen (PRD §12.4).
 */
export interface ExceptionInput {
  type: AvailabilityExceptionType;
  isRecurring: boolean;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  weekdays: number[];
  startMinute: number | null;
  endMinute: number | null;
  intervalWeeks: number;
  recurStartDate: string | null;
  recurEndDate: string | null;
  reason: string | null;
}

const MINUTES_PER_DAY = 1440;

/** '…' → Date op UTC-middernacht (past bij de @db.Date-kolommen). */
function toDateOnly(input: string): Date {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Valideer een uitzondering: eenmalig XOR herhalend, met de veldregels uit
 * PRD §12.4. Gooit `BadRequestException` met NL-melding bij de eerste overtreding.
 */
export function validateExceptionInput(input: ExceptionInput): void {
  if (input.isRecurring) {
    // Geen eenmalige veldenset toegestaan.
    if (input.startsAt != null || input.endsAt != null) {
      throw new BadRequestException(
        'Een herhalende uitzondering mag geen eenmalige start-/einddatum bevatten',
      );
    }
    if (!Array.isArray(input.weekdays) || input.weekdays.length === 0) {
      throw new BadRequestException('Kies minimaal één weekdag voor een herhalende uitzondering');
    }
    for (const wd of input.weekdays) {
      if (!Number.isInteger(wd) || wd < 1 || wd > 7) {
        throw new BadRequestException('Weekdagen moeten tussen 1 (maandag) en 7 (zondag) liggen');
      }
    }
    if (!input.recurStartDate) {
      throw new BadRequestException('Een herhalende uitzondering vereist een begindatum');
    }
    if (!Number.isInteger(input.intervalWeeks) || input.intervalWeeks < 1) {
      throw new BadRequestException('Het herhaalinterval moet minimaal 1 week zijn');
    }
    if (
      input.recurEndDate &&
      toDateOnly(input.recurEndDate).getTime() < toDateOnly(input.recurStartDate).getTime()
    ) {
      throw new BadRequestException('De einddatum moet op of na de begindatum liggen');
    }
    if (!input.allDay) {
      assertMinuteWindow(input.startMinute, input.endMinute);
    }
  } else {
    // Geen herhaalveldenset toegestaan.
    if (
      (input.weekdays && input.weekdays.length > 0) ||
      input.recurStartDate != null ||
      input.recurEndDate != null ||
      input.startMinute != null ||
      input.endMinute != null
    ) {
      throw new BadRequestException(
        'Een eenmalige uitzondering mag geen herhaalvelden (weekdagen/tijden/datums) bevatten',
      );
    }
    if (!input.startsAt || !input.endsAt) {
      throw new BadRequestException('Een eenmalige uitzondering vereist een start- en einddatum');
    }
    if (new Date(input.startsAt).getTime() >= new Date(input.endsAt).getTime()) {
      throw new BadRequestException('De begintijd moet vóór de eindtijd liggen');
    }
  }
}

function assertMinuteWindow(startMinute: number | null, endMinute: number | null): void {
  if (startMinute == null || endMinute == null) {
    throw new BadRequestException('Begin- en eindtijd zijn verplicht (tenzij hele dag)');
  }
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > MINUTES_PER_DAY ||
    startMinute >= endMinute
  ) {
    throw new BadRequestException(
      'Ongeldige tijd: begintijd moet vóór eindtijd liggen en binnen 0–1440 minuten vallen',
    );
  }
}

/**
 * Zet gevalideerde invoer om naar Prisma-schrijfvelden. Herhaalvelden worden
 * genulld bij een eenmalige uitzondering en omgekeerd, zodat een record nooit
 * een halve tegenovergestelde veldenset behoudt (belangrijk bij update).
 */
export function toExceptionData(
  input: ExceptionInput,
): Omit<Prisma.AvailabilityExceptionUncheckedCreateInput, 'orgId' | 'userId' | 'createdById'> {
  if (input.isRecurring) {
    return {
      type: input.type,
      isRecurring: true,
      startsAt: null,
      endsAt: null,
      allDay: input.allDay,
      weekdays: input.weekdays,
      startMinute: input.allDay ? null : input.startMinute,
      endMinute: input.allDay ? null : input.endMinute,
      intervalWeeks: input.intervalWeeks,
      recurStartDate: toDateOnly(input.recurStartDate as string),
      recurEndDate: input.recurEndDate ? toDateOnly(input.recurEndDate) : null,
      reason: input.reason,
    };
  }
  return {
    type: input.type,
    isRecurring: false,
    startsAt: new Date(input.startsAt as string),
    endsAt: new Date(input.endsAt as string),
    allDay: input.allDay,
    weekdays: [],
    startMinute: null,
    endMinute: null,
    intervalWeeks: 1,
    recurStartDate: null,
    recurEndDate: null,
    reason: input.reason,
  };
}
