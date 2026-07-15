import { BadRequestException } from '@nestjs/common';
import { AvailabilityTemplateSlotDto } from './dto';

const WEEKDAY_LABELS = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

/**
 * Validate a template's slot set (pure, DI-free so it is trivially unit-testable):
 *
 * - `0 <= startMinute < endMinute <= 1440`
 * - `weekday` in 1..7
 * - no two slots overlap within the same weekday
 *
 * Throws a `BadRequestException` with a Dutch message on the first violation.
 * (Numeric range/int checks are also enforced by the DTO; this repeats the
 * start<end + overlap rules that class-validator cannot express cross-field.)
 */
export function validateTemplateSlots(slots: AvailabilityTemplateSlotDto[]): void {
  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7) {
      throw new BadRequestException('Weekdag moet tussen 1 (maandag) en 7 (zondag) liggen');
    }
    if (
      !Number.isInteger(slot.startMinute) ||
      !Number.isInteger(slot.endMinute) ||
      slot.startMinute < 0 ||
      slot.endMinute > 1440 ||
      slot.startMinute >= slot.endMinute
    ) {
      throw new BadRequestException(
        'Ongeldig tijdslot: begintijd moet vóór eindtijd liggen en binnen 0–1440 minuten vallen',
      );
    }
  }

  // Overlap-controle per weekdag: sorteer op starttijd en vergelijk buren.
  const byWeekday = new Map<number, AvailabilityTemplateSlotDto[]>();
  for (const slot of slots) {
    const list = byWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    byWeekday.set(slot.weekday, list);
  }

  for (const [weekday, list] of byWeekday) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        throw new BadRequestException(
          `Overlappende tijdsloten op ${WEEKDAY_LABELS[weekday] ?? `weekdag ${weekday}`}`,
        );
      }
    }
  }
}
