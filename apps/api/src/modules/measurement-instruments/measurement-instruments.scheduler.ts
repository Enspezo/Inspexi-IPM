import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MeasurementInstrumentStatus, NotificationType, Role } from '@prisma/client';
import { DEFAULT_CALIBRATION_WARN_DAYS } from '@inspexi/calibration';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

type ExpiryStage = '30d' | 'expired';

/**
 * Dagelijkse controle op (bijna) verlopen kalibraties. Maakt in-app notificatie +
 * e-mail (via NotificationsService) naar de toegewezen inspecteur én de org-admins.
 * Dedupe per stage ("30d"/"expired") via `lastExpiryNotifiedStage`, zodat er niet
 * elke dag opnieuw gemaild wordt. De stage wordt gereset bij een nieuwe kalibratie
 * (zie MeasurementInstrumentsService.recomputeInstrumentCache).
 */
@Injectable()
export class MeasurementInstrumentsScheduler {
  private readonly logger = new Logger(MeasurementInstrumentsScheduler.name);
  private readonly warnDays =
    Number(process.env.MEETMIDDEL_KALIBRATIE_DREMPEL_DAGEN) ||
    DEFAULT_CALIBRATION_WARN_DAYS;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkExpiringCalibrations(): Promise<void> {
    this.logger.log('Controle op (bijna) verlopen kalibraties...');
    const count = await this.processDueCalibrations(new Date());
    this.logger.log(`Kalibratie-controle klaar; ${count} notificatie(s) verstuurd.`);
  }

  /**
   * Kern-logica (testbaar met een vaste `now`): vind ACTIEVE meetmiddelen waarvan de
   * verloopdatum binnen de drempel valt of verstreken is, en notificeer per stage —
   * met dedupe. Retourneert het aantal verstuurde notificaties.
   */
  async processDueCalibrations(now: Date): Promise<number> {
    const threshold = new Date(now.getTime() + this.warnDays * 24 * 60 * 60 * 1000);

    const due = await this.prisma.measurementInstrument.findMany({
      where: {
        isDeleted: false,
        status: MeasurementInstrumentStatus.ACTIEF,
        nextCalibrationDue: { lte: threshold },
      },
      select: {
        id: true,
        orgId: true,
        code: true,
        brand: true,
        type: true,
        assignedToUserId: true,
        nextCalibrationDue: true,
        lastExpiryNotifiedStage: true,
      },
    });

    // Bepaal per meetmiddel de stage; sla over als die stage al verstuurd is.
    const actionable = due
      .map((m) => ({ m, stage: this.stageFor(m.nextCalibrationDue!, now) }))
      .filter(({ m, stage }) => m.lastExpiryNotifiedStage !== stage);

    if (actionable.length === 0) return 0;

    // Org-admins/managers per org batchen (één query per betrokken org).
    const orgIds = [...new Set(actionable.map(({ m }) => m.orgId))];
    const adminsByOrg = new Map<string, string[]>();
    await Promise.all(
      orgIds.map(async (orgId) => {
        const admins = await this.prisma.user.findMany({
          where: {
            orgId,
            roles: { hasSome: [Role.ORG_ADMIN, Role.MANAGER] },
            isActive: true,
          },
          select: { id: true },
        });
        adminsByOrg.set(orgId, admins.map((a) => a.id));
      }),
    );

    let sent = 0;
    for (const { m, stage } of actionable) {
      try {
        const recipients = [
          ...(m.assignedToUserId ? [m.assignedToUserId] : []),
          ...(adminsByOrg.get(m.orgId) ?? []),
        ];
        if (recipients.length === 0) {
          // Niets om naartoe te sturen, maar markeer wel als afgehandeld.
          await this.markNotified(m.id, stage, now);
          continue;
        }

        const dueLabel = m.nextCalibrationDue!.toLocaleDateString('nl-NL');
        const label = `${m.code} (${m.brand} ${m.type})`;
        const isExpired = stage === 'expired';

        this.notifications.dispatch({
          type: isExpired
            ? NotificationType.MEETMIDDEL_KALIBRATIE_VERLOPEN
            : NotificationType.MEETMIDDEL_KALIBRATIE_BINNENKORT,
          orgId: m.orgId,
          recipientUserIds: recipients,
          title: isExpired ? 'Kalibratie verlopen' : 'Kalibratie verloopt binnenkort',
          body: isExpired
            ? `De kalibratie van meetmiddel ${label} is verlopen op ${dueLabel}.`
            : `Meetmiddel ${label} moet vóór ${dueLabel} opnieuw gekalibreerd worden.`,
          entityType: 'measurementInstrument',
          entityId: m.id,
        });

        await this.markNotified(m.id, stage, now);
        sent++;
      } catch (err) {
        this.logger.error(`Kalibratie-notificatie mislukt voor meetmiddel ${m.id}`, err);
      }
    }
    return sent;
  }

  private stageFor(nextCalibrationDue: Date, now: Date): ExpiryStage {
    return nextCalibrationDue.getTime() < now.getTime() ? 'expired' : '30d';
  }

  private markNotified(instrumentId: string, stage: ExpiryStage, now: Date): Promise<unknown> {
    return this.prisma.measurementInstrument.update({
      where: { id: instrumentId },
      data: { lastExpiryNotifiedStage: stage, lastExpiryNotifiedAt: now },
    });
  }
}
