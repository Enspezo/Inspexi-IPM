import { Test, TestingModule } from '@nestjs/testing';
import {
  TIME_TRACKING_SCHEDULER_ENABLED_ENV,
  TimeTrackingScheduler,
} from './time-tracking.scheduler';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '@/prisma';

describe('TimeTrackingScheduler (nachtwaker)', () => {
  let scheduler: TimeTrackingScheduler;

  const mockPrisma: any = {
    timeEntry: { findMany: jest.fn(), update: jest.fn() },
    inspectorLocationPing: { deleteMany: jest.fn() },
  };
  const notifications = { dispatch: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeTrackingScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    scheduler = module.get(TimeTrackingScheduler);
    mockPrisma.timeEntry.update.mockResolvedValue({});
  });

  const entry = (id: string, startedAt: string, timezone = 'Europe/Amsterdam') => ({
    id,
    orgId: 'org-1',
    userId: 'insp-1',
    startedAt: new Date(startedAt),
    activityType: 'UITVOERING',
    organization: { timezone },
  });

  it('stopt een timer van gisteren op 23:59 lokale tijd met reden "nachtwaker" + notificatie', async () => {
    // Timer gestart 26 aug 15:00 CEST; nu is het 27 aug 08:00 CEST
    mockPrisma.timeEntry.findMany.mockResolvedValue([entry('te-1', '2026-08-26T13:00:00Z')]);
    const stopped = await scheduler.processOvernightTimers(new Date('2026-08-27T06:00:00Z'));

    expect(stopped).toBe(1);
    expect(mockPrisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'te-1' },
      data: {
        endedAt: new Date('2026-08-26T21:59:00.000Z'), // 23:59 CEST
        durationMinutes: 8 * 60 + 59,
        stopReason: 'nachtwaker',
      },
    });
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TIMER_NACHTWAKER', recipientUserIds: ['insp-1'] }),
    );
  });

  it('laat een timer van vandaag met rust', async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([entry('te-2', '2026-08-27T05:00:00Z')]);
    const stopped = await scheduler.processOvernightTimers(new Date('2026-08-27T14:00:00Z'));
    expect(stopped).toBe(0);
    expect(mockPrisma.timeEntry.update).not.toHaveBeenCalled();
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('ping-retentie verwijdert pings ouder dan 48 uur', async () => {
    mockPrisma.inspectorLocationPing.deleteMany.mockResolvedValue({ count: 7 });
    const deleted = await scheduler.deleteExpiredPings(new Date('2026-08-27T12:00:00Z'));
    expect(deleted).toBe(7);
    expect(mockPrisma.inspectorLocationPing.deleteMany).toHaveBeenCalledWith({
      where: { recordedAt: { lt: new Date('2026-08-25T12:00:00Z') } },
    });
  });

  // ── Cron-vangnet + kill-switch (review B3) ───────────
  describe('cron-vangnet en env-kill-switch', () => {
    const original = process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV];
    afterEach(() => {
      if (original === undefined) delete process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV];
      else process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV] = original;
    });

    it.each(['0', 'false', 'FALSE'])(
      'draait geen van beide crons wanneer de kill-switch op %s staat',
      async (value) => {
        process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV] = value;

        await scheduler.stopOvernightTimers();
        await scheduler.cleanupLocationPings();

        expect(mockPrisma.timeEntry.findMany).not.toHaveBeenCalled();
        expect(mockPrisma.inspectorLocationPing.deleteMany).not.toHaveBeenCalled();
      },
    );

    it('draait standaard (env niet gezet) en bij een andere waarde', async () => {
      delete process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV];
      mockPrisma.timeEntry.findMany.mockResolvedValue([]);
      mockPrisma.inspectorLocationPing.deleteMany.mockResolvedValue({ count: 0 });

      await scheduler.stopOvernightTimers();
      await scheduler.cleanupLocationPings();

      expect(mockPrisma.timeEntry.findMany).toHaveBeenCalled();
      expect(mockPrisma.inspectorLocationPing.deleteMany).toHaveBeenCalled();
    });

    it('nachtwaker-cron slikt een onverwachte fout (geen unhandled rejection)', async () => {
      mockPrisma.timeEntry.findMany.mockRejectedValue(new Error('db down'));
      await expect(scheduler.stopOvernightTimers()).resolves.toBeUndefined();
    });

    it('ping-retentie-cron slikt een onverwachte fout (geen unhandled rejection)', async () => {
      mockPrisma.inspectorLocationPing.deleteMany.mockRejectedValue(new Error('db down'));
      await expect(scheduler.cleanupLocationPings()).resolves.toBeUndefined();
    });
  });

  it('lokale-dagovergang telt, niet de UTC-dag', async () => {
    // Gestart 22:30 UTC 26 aug = 00:30 CEST 27 aug; nu 27 aug 14:00 CEST → zelfde lokale dag
    mockPrisma.timeEntry.findMany.mockResolvedValue([entry('te-3', '2026-08-26T22:30:00Z')]);
    const stopped = await scheduler.processOvernightTimers(new Date('2026-08-27T12:00:00Z'));
    expect(stopped).toBe(0);
  });
});
