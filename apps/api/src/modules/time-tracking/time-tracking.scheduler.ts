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
    const stopped = await this.processOvernightTimers(new Date());
    if (stopped > 0) {
      this.logger.log(`Nachtwaker: ${stopped} vergeten timer(s) gestopt.`);
    }
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
        this.logger.error(`Nachtwaker: stoppen van timer ${entry.id} mislukt`, err as Error);
      }
    }
    return stopped;
  }
}
