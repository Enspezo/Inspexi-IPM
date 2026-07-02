import { describe, it, expect } from 'vitest';
import { MilestoneStatus } from '@/types';
import type { PhaseMilestoneSummaryItem } from '@/types';
import { reorderById, summarizeMilestones } from './project-phases.helpers';

// ─── reorderById ───────────────────────────────────────────

describe('reorderById', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('moves an item downwards to the target position', () => {
    expect(reorderById(items, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item upwards to the target position', () => {
    expect(reorderById(items, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the original order for a no-op (same id)', () => {
    expect(reorderById(items, 'b', 'b')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the original order when an id is unknown', () => {
    expect(reorderById(items, 'x', 'b')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    reorderById(items, 'a', 'd');
    expect(items).toEqual(copy);
  });
});

// ─── summarizeMilestones ───────────────────────────────────

function mk(
  status: MilestoneStatus,
  dueDate: string,
): PhaseMilestoneSummaryItem {
  return { id: Math.random().toString(36).slice(2), status, dueDate };
}

describe('summarizeMilestones', () => {
  const now = new Date('2026-07-02T12:00:00.000Z');

  it('reports "Geen milestones" for an empty list', () => {
    const s = summarizeMilestones([], now);
    expect(s.total).toBe(0);
    expect(s.label).toBe('Geen milestones');
    expect(s.accent).toBe('gray');
  });

  it('handles an undefined list', () => {
    expect(summarizeMilestones(undefined, now).total).toBe(0);
  });

  it('counts each status bucket', () => {
    const s = summarizeMilestones(
      [
        mk(MilestoneStatus.BEHAALD, '2026-06-01'),
        mk(MilestoneStatus.OPEN, '2026-08-01'),
        mk(MilestoneStatus.VERVALLEN, '2026-05-01'),
      ],
      now,
    );
    expect(s.behaald).toBe(1);
    expect(s.open).toBe(1);
    expect(s.vervallen).toBe(1);
    expect(s.total).toBe(3);
  });

  it('marks an OPEN milestone with a past dueDate as verlopen', () => {
    const s = summarizeMilestones(
      [
        mk(MilestoneStatus.OPEN, '2026-07-01'), // gisteren
        mk(MilestoneStatus.OPEN, '2026-07-10'), // toekomst
      ],
      now,
    );
    expect(s.verlopen).toBe(1);
    expect(s.accent).toBe('red');
    expect(s.label).toBe('0/2 behaald, 1 verlopen');
  });

  it('does not count a BEHAALD milestone with a past dueDate as verlopen', () => {
    const s = summarizeMilestones(
      [mk(MilestoneStatus.BEHAALD, '2026-01-01')],
      now,
    );
    expect(s.verlopen).toBe(0);
    expect(s.label).toBe('1/1 behaald');
  });

  it('treats a dueDate equal to today as not verlopen', () => {
    const s = summarizeMilestones(
      [mk(MilestoneStatus.OPEN, '2026-07-02')],
      now,
    );
    expect(s.verlopen).toBe(0);
  });
});
