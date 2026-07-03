import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MilestoneStatus, NotificationType, ProjectStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { PROJECT_FASEN_FEATURE } from '@/common';

type MilestoneStage = 'upcoming' | 'overdue';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dagelijkse controle op (bijna) verlopen milestones binnen een projectfase
 * (PRD-12 §12.6.2). Maakt een in-app notificatie (via NotificationsService, dus
 * prefs werken mee) naar de milestone-assignee, de projectmanager en de interne
 * fasevolgers. Dedupe per stage ("upcoming"/"overdue") via `lastReminderStage`,
 * zodat er niet elke dag opnieuw gemeld wordt; die stage wordt in de service
 * gereset bij een `dueDate`-wijziging of een statuswissel terug naar OPEN.
 *
 * Gemodelleerd naar MeasurementInstrumentsScheduler.
 */
@Injectable()
export class ProjectPhasesScheduler {
  private readonly logger = new Logger(ProjectPhasesScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private entitlements: EntitlementsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkDueMilestones(): Promise<void> {
    this.logger.log('Controle op milestone-reminders...');
    const count = await this.processDueMilestones(new Date());
    this.logger.log(`Milestone-controle klaar; ${count} notificatie(s) verstuurd.`);
  }

  /**
   * Kern-logica (testbaar met een vaste `now`): vind OPEN milestones op niet-
   * verwijderde fasen van ACTIEVE projecten, waarvan de reminder-drempel bereikt
   * is, en notificeer per stage — met dedupe. Retourneert het aantal verstuurde
   * notificaties.
   */
  async processDueMilestones(now: Date): Promise<number> {
    const openMilestones = await this.prisma.phaseMilestone.findMany({
      where: {
        status: MilestoneStatus.OPEN,
        phase: { isDeleted: false, project: { status: ProjectStatus.ACTIEF } },
      },
      select: {
        id: true,
        orgId: true,
        title: true,
        dueDate: true,
        reminderDaysBefore: true,
        assigneeId: true,
        lastReminderStage: true,
        phase: {
          select: {
            id: true,
            name: true,
            followers: { select: { userId: true } },
            project: { select: { projectManagerId: true } },
          },
        },
      },
    });

    // Orgs zonder PROJECT_FASEN krijgen geen milestone-reminders (§Fase E). Batch
    // de entitlement-lookup per unieke org (niet per milestone) en filter daarna.
    const orgIds = [...new Set(openMilestones.map((m) => m.orgId))];
    const orgHasFeature = new Map<string, boolean>();
    await Promise.all(
      orgIds.map(async (oid) => {
        const enabled = await this.entitlements.getEnabledFeatures(oid);
        orgHasFeature.set(oid, enabled.includes(PROJECT_FASEN_FEATURE));
      }),
    );

    // `reminderDaysBefore` is per milestone → in JS filteren op het venster
    // (dueDate <= now + reminderDaysBefore). Daarna per stage dedupen.
    const actionable = openMilestones
      .filter((m) => orgHasFeature.get(m.orgId))
      .filter((m) => m.dueDate.getTime() <= now.getTime() + m.reminderDaysBefore * DAY_MS)
      .map((m) => ({ m, stage: this.stageFor(m.dueDate, now) }))
      .filter(({ m, stage }) => m.lastReminderStage !== stage);

    if (actionable.length === 0) return 0;

    let sent = 0;
    for (const { m, stage } of actionable) {
      try {
        const recipients = [
          ...(m.assigneeId ? [m.assigneeId] : []),
          ...(m.phase.project?.projectManagerId ? [m.phase.project.projectManagerId] : []),
          ...m.phase.followers.map((f) => f.userId).filter((uid): uid is string => !!uid),
        ];
        const recipientUserIds = [...new Set(recipients)];

        if (recipientUserIds.length === 0) {
          // Niemand om naartoe te sturen, maar markeer wel als afgehandeld.
          await this.markNotified(m.id, stage, now);
          continue;
        }

        const dueLabel = m.dueDate.toLocaleDateString('nl-NL');
        const isOverdue = stage === 'overdue';

        this.notifications.dispatch({
          type: isOverdue
            ? NotificationType.MILESTONE_VERLOPEN
            : NotificationType.MILESTONE_HERINNERING,
          orgId: m.orgId,
          recipientUserIds,
          title: isOverdue ? 'Milestone verlopen' : 'Milestone-herinnering',
          body: isOverdue
            ? `Milestone '${m.title}' van fase '${m.phase.name}' is verlopen (streefdatum ${dueLabel}).`
            : `Milestone '${m.title}' van fase '${m.phase.name}' nadert de streefdatum ${dueLabel}.`,
          entityType: 'projectPhase',
          entityId: m.phase.id,
        });

        await this.markNotified(m.id, stage, now);
        sent++;
      } catch (err) {
        this.logger.error(`Milestone-notificatie mislukt voor milestone ${m.id}`, err);
      }
    }
    return sent;
  }

  private stageFor(dueDate: Date, now: Date): MilestoneStage {
    return dueDate.getTime() < now.getTime() ? 'overdue' : 'upcoming';
  }

  private markNotified(
    milestoneId: string,
    stage: MilestoneStage,
    now: Date,
  ): Promise<unknown> {
    return this.prisma.phaseMilestone.update({
      where: { id: milestoneId },
      data: { lastReminderStage: stage, lastReminderAt: now },
    });
  }
}
