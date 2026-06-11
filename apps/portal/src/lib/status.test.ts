import { describe, expect, it } from 'vitest';
import {
  PlanningStatus,
  ProjectStatus,
  QuoteStatus,
  RequestStatus,
  SessionStatus,
  TaskStatus,
  TaskType,
  WorkOrderStatus,
} from '@/types';
import {
  getStatusConfig,
  PLANNING_STATUS,
  PROJECT_STATUS,
  QUOTE_STATUS,
  REQUEST_STATUS,
  SESSION_STATUS,
  TASK_STATUS,
  TASK_TYPE,
  WORK_ORDER_STATUS,
} from './status';

describe('status maps', () => {
  it.each([
    ['TASK_STATUS', TASK_STATUS, Object.values(TaskStatus)],
    ['TASK_TYPE', TASK_TYPE, Object.values(TaskType)],
    ['REQUEST_STATUS', REQUEST_STATUS, Object.values(RequestStatus)],
    ['QUOTE_STATUS', QUOTE_STATUS, Object.values(QuoteStatus)],
    ['PLANNING_STATUS', PLANNING_STATUS, Object.values(PlanningStatus)],
    ['SESSION_STATUS', SESSION_STATUS, Object.values(SessionStatus)],
    ['WORK_ORDER_STATUS', WORK_ORDER_STATUS, Object.values(WorkOrderStatus)],
    ['PROJECT_STATUS', PROJECT_STATUS, Object.values(ProjectStatus)],
  ] as const)('%s covers every enum value', (_name, map, values) => {
    for (const value of values) {
      expect(map[value], `missing mapping for ${value}`).toBeDefined();
      expect(map[value].label).toBeTruthy();
      expect(map[value].classes).toMatch(/bg-/);
    }
  });
});

describe('getStatusConfig', () => {
  it('returns the mapped config for known values', () => {
    expect(getStatusConfig(QUOTE_STATUS, QuoteStatus.GEACCEPTEERD).label).toBe('Geaccepteerd');
  });

  it('falls back to gray with raw value as label for unknown values', () => {
    const config = getStatusConfig(QUOTE_STATUS, 'ONBEKEND');
    expect(config.label).toBe('ONBEKEND');
    expect(config.classes).toContain('bg-gray-100');
  });

  it('handles null/undefined with em dash label', () => {
    expect(getStatusConfig(QUOTE_STATUS, null).label).toBe('—');
    expect(getStatusConfig(QUOTE_STATUS, undefined).label).toBe('—');
  });
});
