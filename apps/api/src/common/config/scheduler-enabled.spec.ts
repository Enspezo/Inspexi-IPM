import { isEnabledFlag, isSchedulerEnabled } from './scheduler-enabled';

describe('isSchedulerEnabled (F5 — globale cron-kill-switch)', () => {
  it('is aan bij ontbrekende/lege/onbekende waarde', () => {
    expect(isSchedulerEnabled({})).toBe(true);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: '' })).toBe(true);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'true' })).toBe(true);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'yes' })).toBe(true);
  });

  it("is uit bij '0' of 'false' (case-insensitief, getrimd)", () => {
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: ' FALSE ' })).toBe(false);
    expect(isSchedulerEnabled({ SCHEDULER_ENABLED: '0' })).toBe(false);
    expect(isEnabledFlag('False')).toBe(false);
  });
});
