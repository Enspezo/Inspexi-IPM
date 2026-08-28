import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  durationMinutesBetween,
  formatDateNl,
  isSameLocalDay,
  localDayEndUtc,
} from './time-tracking.helpers';

/**
 * Env-kill-switch voor beide time-tracking-crons. Default aan; alleen de
 * expliciete waarden `'0'` en `'false'` (case-insensitief) schakelen ze uit —
 * zelfde contract als `TOMBSTONE_CLEANUP_ENABLED`. Gedocumenteerd in
 * `.env.example`; handig om ze op een tweede API-instantie uit te zetten zodat
 * de nachtwaker niet dubbel draait.
 */
export const TIME_TRACKING_SCHEDULER_ENABLED_ENV = 'TIME_TRACKING_SCHEDULER_ENABLED';

/**
 * Nachtwaker (PRD-16 §4.3): een timer die aan het einde van zijn lokale
 * kalenderdag (org-tijdzone) nog loopt, wordt server-side gestopt op 23:59
 * van die dag — voorkomt 40-uursregels door een vergeten stop. De inspecteur
 * krijgt een TIMER_NACHTWAKER-notificatie en kan de regel daarna corrigeren.
 */
@Injectable()
export class TimeTrackingScheduler {
  private readonly logger = new Logger(TimeTrackingScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async stopOvernightTimers(): Promise<void> {
    if (!TimeTrackingScheduler.isEnabled()) {
      this.logger.log(
        `Nachtwaker overgeslagen: uitgeschakeld via ${TIME_TRACKING_SCHEDULER_ENABLED_ENV}.`,
      );
      return;
    }

    // Vangnet: per-timer fouten worden al binnen processOvernightTimers gevangen,
    // maar de cron mag onder geen beding een unhandled rejection produceren
    // (een falende findMany zou het proces anders kunnen omleggen).
    try {
      const stopped = await this.processOvernightTimers(new Date());
      if (stopped > 0) {
        this.logger.log(`Nachtwaker: ${stopped} vergeten timer(s) gestopt.`);
      }
    } catch (err) {
      this.logger.error('Nachtwaker-cron faalde onverwacht.', this.stack(err));
    }
  }

  /**
   * Dataminimalisatie (PRD-16 §7): locatie-pings maximaal 48 uur bewaren.
   * Alleen de laatste positie wordt ooit getoond; historie heeft geen doel.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupLocationPings(): Promise<void> {
    if (!TimeTrackingScheduler.isEnabled()) {
      this.logger.log(
        `Ping-retentie overgeslagen: uitgeschakeld via ${TIME_TRACKING_SCHEDULER_ENABLED_ENV}.`,
      );
      return;
    }

    try {
      const deleted = await this.deleteExpiredPings(new Date());
      if (deleted > 0) {
        this.logger.log(`Ping-retentie: ${deleted} locatie-ping(s) ouder dan 48u verwijderd.`);
      }
    } catch (err) {
      this.logger.error('Ping-retentie-cron faalde onverwacht.', this.stack(err));
    }
  }

  /** Kern-logica, testbaar met een vaste `now`. Retourneert het aantal verwijderde pings. */
  async deleteExpiredPings(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = await this.prisma.inspectorLocationPing.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });
    return result.count;
  }

  /** Kern-logica, testbaar met een vaste `now`. Retourneert het aantal gestopte timers. */
  async processOvernightTimers(now: Date): Promise<number> {
    const running = await this.prisma.timeEntry.findMany({
      where: { endedAt: null, isDeleted: false },
      select: {
        id: true,
        orgId: true,
        userId: true,
        startedAt: true,
        activityType: true,
        organization: { select: { timezone: true } },
      },
    });

    let stopped = 0;
    for (const entry of running) {
      const timeZone = entry.organization.timezone || 'Europe/Amsterdam';
      if (isSameLocalDay(entry.startedAt, now, timeZone)) continue; // dag is nog bezig

      const endedAt = localDayEndUtc(entry.startedAt, timeZone);
      try {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: {
            endedAt,
            durationMinutes: durationMinutesBetween(entry.startedAt, endedAt),
            stopReason: 'nachtwaker',
          },
        });
        stopped++;
        this.notifications.dispatch({
          type: NotificationType.TIMER_NACHTWAKER,
          orgId: entry.orgId,
          recipientUserIds: [entry.userId],
          title: 'Timer automatisch gestopt',
          body: `Je timer van ${formatDateNl(entry.startedAt, timeZone)} liep nog en is om 23:59 automatisch gestopt. Controleer en corrigeer de regel indien nodig.`,
          entityType: 'timeEntry',
          entityId: entry.id,
        });
      } catch (err) {
        this.logger.error(`Nachtwaker: stoppen van timer ${entry.id} mislukt`, this.stack(err));
      }
    }
    return stopped;
  }

  private stack(err: unknown): string {
    return err instanceof Error ? (err.stack ?? err.message) : String(err);
  }

  /** Default aan; alleen '0'/'false' (case-insensitief) schakelt uit. */
  private static isEnabled(): boolean {
    const raw = process.env[TIME_TRACKING_SCHEDULER_ENABLED_ENV]?.trim().toLowerCase();
    return raw !== '0' && raw !== 'false';
  }
}
