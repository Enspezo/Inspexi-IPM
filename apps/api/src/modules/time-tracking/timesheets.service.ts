import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  Role,
  TimeActivityType,
  TimesheetStatus,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, buildOrderBy, orgScope, paginate } from '@/common';
import { CRM_ROLES, MANAGEMENT_ROLES } from '@/common/auth/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { TimeEntriesService } from './time-entries.service';
import { formatDurationNl } from './time-tracking.helpers';
import { ListTimeEntriesQueryDto, ListTimesheetsQueryDto } from './dto';

/** NL-labels voor de CSV-export (portal heeft zijn eigen status-map). */
export const ACTIVITY_LABELS_NL: Record<TimeActivityType, string> = {
  VOORBEREIDING: 'Voorbereiding',
  UITVOERING: 'Uitvoering',
  RAPPORTAGE: 'Rapportage',
  REISTIJD: 'Reistijd',
  OVERIG: 'Overig',
};

const CSV_EXPORT_CAP = 10_000;

export interface TimesheetTotals {
  totalMinutes: number;
  byActivity: Partial<Record<TimeActivityType, number>>;
}

@Injectable()
export class TimesheetsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private timeEntries: TimeEntriesService,
  ) {}

  // ─── Lijst & detail ────────────────────────────────────

  async findAll(user: User, query: ListTimesheetsQueryDto) {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const where: Prisma.TimesheetWhereInput = { ...orgScope(user) };

    if (!this.isStaffViewer(user)) {
      where.userId = user.id;
    } else if (query.userId) {
      where.userId = query.userId;
    }
    if (query.status) where.status = query.status;
    if (query.year) where.year = query.year;
    if (query.week) where.weekNumber = query.week;

    const orderBy = buildOrderBy(
      sortBy,
      sortOrder,
      ['year', 'weekNumber', 'status', 'submittedAt', 'createdAt'],
      { createdAt: 'desc' },
    );

    const result = await paginate(this.prisma.timesheet, {
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy,
      page,
      limit,
    });

    const totals = await this.totalsFor(result.data.map((t: { id: string }) => t.id));
    return {
      ...result,
      data: result.data.map((t: { id: string }) => ({ ...t, totals: totals.get(t.id) ?? emptyTotals() })),
    };
  }

  async findOne(id: string, user: User) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id, ...orgScope(user) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        entries: {
          where: { isDeleted: false },
          orderBy: { startedAt: 'asc' },
          include: {
            project: { select: { id: true, projectNumber: true, title: true } },
            inspectionPlan: { select: { id: true, projectName: true } },
            planningItem: { select: { id: true, productName: true } },
            correctedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    assertFound(timesheet, 'Weekstaat');

    if (!this.isStaffViewer(user) && timesheet!.userId !== user.id) {
      // Zelfde melding als "bestaat niet" — geen existence-oracle.
      throw new NotFoundException('Weekstaat niet gevonden');
    }

    const totals = await this.totalsFor([timesheet!.id]);
    return { ...timesheet, totals: totals.get(timesheet!.id) ?? emptyTotals() };
  }

  // ─── Statusflow ────────────────────────────────────────

  async submit(id: string, user: User) {
    const timesheet = await this.loadOwn(id, user);
    if (
      timesheet.status !== TimesheetStatus.CONCEPT &&
      timesheet.status !== TimesheetStatus.AFGEWEZEN
    ) {
      throw new ConflictException('Deze weekstaat is al ingediend of goedgekeurd');
    }

    const [running, unassigned, entryCount] = await Promise.all([
      this.prisma.timeEntry.count({
        where: { timesheetId: id, endedAt: null, isDeleted: false },
      }),
      this.prisma.timeEntry.count({
        where: { timesheetId: id, needsProjectAssignment: true, isDeleted: false },
      }),
      this.prisma.timeEntry.count({ where: { timesheetId: id, isDeleted: false } }),
    ]);
    if (running > 0) {
      throw new ConflictException('Stop eerst de lopende timer in deze week');
    }
    if (unassigned > 0) {
      throw new ConflictException(
        'Wijs eerst alle automatische reistijd-regels aan een project toe',
      );
    }
    if (entryCount === 0) {
      throw new ConflictException('Deze weekstaat bevat nog geen urenregels');
    }

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: { status: TimesheetStatus.INGEDIEND, submittedAt: new Date(), reviewNote: null },
    });

    this.notifyApprovers(timesheet.orgId, user, updated).catch(() => undefined);
    return updated;
  }

  async approve(id: string, user: User) {
    const timesheet = await this.loadForReview(id, user);
    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: { status: TimesheetStatus.GOEDGEKEURD, reviewedById: user.id, reviewedAt: new Date() },
    });
    this.notifications.dispatch({
      type: NotificationType.WEEKSTAAT_GOEDGEKEURD,
      orgId: timesheet.orgId,
      recipientUserIds: [timesheet.userId],
      title: `Weekstaat week ${timesheet.weekNumber} goedgekeurd`,
      body: `Je urenstaat van week ${timesheet.weekNumber} (${timesheet.year}) is goedgekeurd.`,
      entityType: 'timesheet',
      entityId: id,
    });
    return updated;
  }

  async reject(id: string, user: User, note: string) {
    const timesheet = await this.loadForReview(id, user);
    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        status: TimesheetStatus.AFGEWEZEN,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });
    this.notifications.dispatch({
      type: NotificationType.WEEKSTAAT_AFGEWEZEN,
      orgId: timesheet.orgId,
      recipientUserIds: [timesheet.userId],
      title: `Weekstaat week ${timesheet.weekNumber} afgewezen`,
      body: `Je urenstaat van week ${timesheet.weekNumber} (${timesheet.year}) is afgewezen: ${note}`,
      entityType: 'timesheet',
      entityId: id,
    });
    return updated;
  }

  // ─── Export ────────────────────────────────────────────

  /**
   * CSV-export (Excel-compatibel: `;`-separator + BOM, nl-NL notaties).
   * Zelfde filters als de urenregel-lijst; standaard alle statussen.
   */
  async exportCsv(user: User, query: ListTimeEntriesQueryDto): Promise<string> {
    const where = this.timeEntries.buildWhere(user, query);
    const entries = await this.prisma.timeEntry.findMany({
      where,
      orderBy: [{ userId: 'asc' }, { startedAt: 'asc' }],
      take: CSV_EXPORT_CAP,
      include: {
        user: { select: { firstName: true, lastName: true } },
        project: { select: { projectNumber: true, title: true } },
        timesheet: { select: { status: true, year: true, weekNumber: true } },
      },
    });

    const header = [
      'Inspecteur',
      'Datum',
      'Week',
      'Activiteit',
      'Projectnummer',
      'Project',
      'Start',
      'Eind',
      'Duur (min)',
      'Weekstaat-status',
      'Bron',
      'Notitie',
    ];
    const dateFmt = new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const timeFmt = new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      minute: '2-digit',
    });

    const rows = entries.map((e) => [
      `${e.user.firstName} ${e.user.lastName}`.trim(),
      dateFmt.format(e.startedAt),
      e.timesheet ? `${e.timesheet.weekNumber}-${e.timesheet.year}` : '',
      ACTIVITY_LABELS_NL[e.activityType],
      e.project?.projectNumber ?? '',
      e.project?.title ?? '',
      timeFmt.format(e.startedAt),
      e.endedAt ? timeFmt.format(e.endedAt) : '',
      e.durationMinutes != null ? String(e.durationMinutes) : '',
      e.timesheet?.status ?? '',
      e.source,
      e.notes ?? '',
    ]);

    const escape = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [header, ...rows].map((row) => row.map(escape).join(';'));
    // BOM zodat Excel de UTF-8-encoding (é, ë, …) herkent.
    return '\uFEFF' + lines.join('\r\n');
  }

  // ─── Interne helpers ───────────────────────────────────

  private isStaffViewer(user: User): boolean {
    return user.roles.some((r) => (CRM_ROLES as readonly Role[]).includes(r));
  }

  private async loadOwn(id: string, user: User) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id, ...orgScope(user) },
    });
    assertFound(timesheet, 'Weekstaat');
    if (timesheet!.userId !== user.id) {
      throw new ForbiddenException('Alleen de inspecteur zelf kan deze weekstaat indienen');
    }
    return timesheet!;
  }

  private async loadForReview(id: string, user: User) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id, ...orgScope(user) },
    });
    assertFound(timesheet, 'Weekstaat');
    if (timesheet!.status !== TimesheetStatus.INGEDIEND) {
      throw new ConflictException('Alleen ingediende weekstaten kunnen beoordeeld worden');
    }
    return timesheet!;
  }

  /** Totalen (per activiteit + totaal) per weekstaat, in één groupBy. */
  private async totalsFor(ids: string[]): Promise<Map<string, TimesheetTotals>> {
    const map = new Map<string, TimesheetTotals>();
    if (ids.length === 0) return map;

    const grouped = await this.prisma.timeEntry.groupBy({
      by: ['timesheetId', 'activityType'],
      where: { timesheetId: { in: ids }, isDeleted: false },
      _sum: { durationMinutes: true },
    });
    for (const row of grouped) {
      if (!row.timesheetId) continue;
      const totals = map.get(row.timesheetId) ?? emptyTotals();
      const minutes = row._sum.durationMinutes ?? 0;
      totals.totalMinutes += minutes;
      totals.byActivity[row.activityType] = (totals.byActivity[row.activityType] ?? 0) + minutes;
      map.set(row.timesheetId, totals);
    }
    return map;
  }

  private async notifyApprovers(
    orgId: string,
    submitter: User,
    timesheet: { id: string; weekNumber: number; year: number },
  ): Promise<void> {
    const approvers = await this.prisma.user.findMany({
      where: {
        orgId,
        isDeleted: false,
        isActive: true,
        roles: { hasSome: [Role.MANAGER, Role.ORG_ADMIN] },
      },
      select: { id: true },
    });
    const total = await this.prisma.timeEntry.aggregate({
      where: { timesheetId: timesheet.id, isDeleted: false },
      _sum: { durationMinutes: true },
    });
    this.notifications.dispatch({
      type: NotificationType.WEEKSTAAT_INGEDIEND,
      orgId,
      recipientUserIds: approvers.map((a) => a.id).filter((uid) => uid !== submitter.id),
      title: `Weekstaat ingediend door ${submitter.firstName} ${submitter.lastName}`,
      body: `Week ${timesheet.weekNumber} (${timesheet.year}), totaal ${formatDurationNl(total._sum.durationMinutes ?? 0)} — te beoordelen.`,
      entityType: 'timesheet',
      entityId: timesheet.id,
    });
  }
}

function emptyTotals(): TimesheetTotals {
  return { totalMinutes: 0, byActivity: {} };
}
