import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  TaskEntityType,
  TaskStatus,
  TaskType,
  TimeActivityType,
  TimeEntrySource,
  TimesheetStatus,
  User,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  assertFound,
  assertSameOrg,
  buildOrderBy,
  orgScope,
  paginate,
  requireOrg,
} from '@/common';
import { CRM_ROLES, MANAGEMENT_ROLES } from '@/common/auth/roles';
import { durationMinutesBetween, formatDateNl, isoWeekOf } from './time-tracking.helpers';
import {
  CreateTimeEntryDto,
  ListTimeEntriesQueryDto,
  StartTimeEntryDto,
  UpdateTimeEntryDto,
} from './dto';

/** Hoe ver een (offline gedetecteerde) starttijd maximaal terug mag liggen. */
const MAX_BACKDATE_MS = 12 * 60 * 60 * 1000;
/** Kleine klok-drift van devices toestaan. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const ENTRY_INCLUDE = {
  project: { select: { id: true, projectNumber: true, title: true } },
  inspectionPlan: { select: { id: true, projectName: true } },
  planningItem: { select: { id: true, productName: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  timesheet: { select: { id: true, status: true, year: true, weekNumber: true } },
} satisfies Prisma.TimeEntryInclude;

@Injectable()
export class TimeEntriesService {
  private readonly logger = new Logger(TimeEntriesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Timer starten/stoppen ─────────────────────────────

  async start(user: User, dto: StartTimeEntryDto) {
    const orgId = requireOrg(user);
    const source = dto.source ?? TimeEntrySource.HANDMATIG;
    const startedAt = this.parseStartedAt(dto.startedAt);

    // Idempotente sync-retry: zelfde clientId → zelfde regel terug, geen dubbele start.
    if (dto.clientId) {
      const existing = await this.prisma.timeEntry.findUnique({
        where: { orgId_clientId: { orgId, clientId: dto.clientId } },
        include: ENTRY_INCLUDE,
      });
      if (existing) return { entry: existing, stoppedEntry: null };
    }

    const needsProjectAssignment = this.resolveProjectRule(
      dto.activityType,
      dto.projectId ?? null,
      source,
    );
    await this.assertEntryFksInOrg(user, dto);

    let stoppedEntry: { id: string } | null = null;
    let entry;
    try {
      entry = await this.prisma.$transaction(async (tx) => {
        stoppedEntry = await this.stopRunningTx(tx, orgId, user.id, 'gewisseld');
        const timesheetId = await this.ensureOpenTimesheet(tx, orgId, user.id, startedAt, false);
        return tx.timeEntry.create({
          data: {
            orgId,
            userId: user.id,
            activityType: dto.activityType,
            source,
            projectId: dto.projectId ?? null,
            inspectionPlanId: dto.inspectionPlanId ?? null,
            planningItemId: dto.planningItemId ?? null,
            startedAt,
            notes: dto.notes ?? null,
            clientId: dto.clientId ?? null,
            needsProjectAssignment,
            timesheetId,
          },
          include: ENTRY_INCLUDE,
        });
      });
    } catch (err) {
      // Partial unique index `imp_time_entries_running_user_key`: twee gelijktijdige
      // starts → de verliezer krijgt een nette 409 i.p.v. een dubbele timer.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Er loopt al een timer; stop deze eerst');
      }
      throw err;
    }

    if (needsProjectAssignment) {
      // Fire-and-forget: het taak-aanmaken mag het starten van de timer nooit blokkeren.
      this.createAssignmentTask(entry.id, orgId, user.id, startedAt).catch((err) =>
        this.logger.error('Aanmaken toewijs-taak mislukt', err),
      );
    }

    return { entry, stoppedEntry };
  }

  async stop(user: User) {
    const orgId = requireOrg(user);
    const stopped = await this.prisma.$transaction((tx) =>
      this.stopRunningTx(tx, orgId, user.id, 'handmatig'),
    );
    if (!stopped) {
      throw new NotFoundException('Er loopt geen timer');
    }
    return this.prisma.timeEntry.findUnique({
      where: { id: stopped.id },
      include: ENTRY_INCLUDE,
    });
  }

  /** Lopende timer van de gebruiker (of null) — voor de PWA-timerbalk. */
  async findRunning(user: User) {
    const orgId = requireOrg(user);
    return this.prisma.timeEntry.findFirst({
      where: { orgId, userId: user.id, endedAt: null, isDeleted: false },
      include: ENTRY_INCLUDE,
    });
  }

  // ─── CRUD ──────────────────────────────────────────────

  async createManual(user: User, dto: CreateTimeEntryDto) {
    const orgId = requireOrg(user);
    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    if (!(endedAt.getTime() > startedAt.getTime())) {
      throw new BadRequestException('Eindtijd moet na de starttijd liggen');
    }

    if (dto.clientId) {
      const existing = await this.prisma.timeEntry.findUnique({
        where: { orgId_clientId: { orgId, clientId: dto.clientId } },
        include: ENTRY_INCLUDE,
      });
      if (existing) return existing;
    }

    // Handmatige regels kennen de REIS_AUTO-uitzondering niet.
    this.resolveProjectRule(dto.activityType, dto.projectId ?? null, TimeEntrySource.HANDMATIG);
    await this.assertEntryFksInOrg(user, dto);

    return this.prisma.$transaction(async (tx) => {
      const timesheetId = await this.ensureOpenTimesheet(tx, orgId, user.id, startedAt, false);
      return tx.timeEntry.create({
        data: {
          orgId,
          userId: user.id,
          activityType: dto.activityType,
          source: TimeEntrySource.HANDMATIG,
          projectId: dto.projectId ?? null,
          inspectionPlanId: dto.inspectionPlanId ?? null,
          planningItemId: dto.planningItemId ?? null,
          startedAt,
          endedAt,
          durationMinutes: durationMinutesBetween(startedAt, endedAt),
          stopReason: 'handmatig',
          notes: dto.notes ?? null,
          clientId: dto.clientId ?? null,
          timesheetId,
        },
        include: ENTRY_INCLUDE,
      });
    });
  }

  async findAll(user: User, query: ListTimeEntriesQueryDto) {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const where = this.buildWhere(user, query);
    const orderBy = buildOrderBy(sortBy, sortOrder, ['startedAt', 'createdAt', 'activityType'], {
      startedAt: 'desc',
    });
    return paginate(this.prisma.timeEntry, {
      where,
      include: ENTRY_INCLUDE,
      orderBy,
      page,
      limit,
    });
  }

  /** Gedeelde where-builder — ook gebruikt door de CSV-export van weekstaten. */
  buildWhere(user: User, query: ListTimeEntriesQueryDto): Prisma.TimeEntryWhereInput {
    const where: Prisma.TimeEntryWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    // INSPECTEUR zonder kantoorrol ziet uitsluitend eigen regels.
    if (!this.isStaffViewer(user)) {
      where.userId = user.id;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.projectId) where.projectId = query.projectId;
    if (query.activityType) where.activityType = query.activityType;
    if (query.timesheetId) where.timesheetId = query.timesheetId;
    if (query.timesheetStatus) where.timesheet = { status: query.timesheetStatus };
    if (query.from || query.to) {
      where.startedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }
    return where;
  }

  async update(id: string, user: User, dto: UpdateTimeEntryDto) {
    const entry = await this.loadEntry(id, user);
    const isOwner = entry.userId === user.id;
    const isManager = user.roles.some((r) => (MANAGEMENT_ROLES as readonly Role[]).includes(r));

    if (!isOwner && !isManager) {
      throw new ForbiddenException('Alleen de inspecteur zelf of een manager kan deze regel wijzigen');
    }
    this.assertEntryMutable(entry.timesheet?.status ?? TimesheetStatus.CONCEPT, isOwner);

    // Effectieve waarden na de merge bepalen de projectregel.
    const effActivity = dto.activityType ?? entry.activityType;
    const effProjectId =
      dto.projectId === undefined ? entry.projectId : dto.projectId;
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : entry.startedAt;
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : entry.endedAt;
    if (endedAt && !(endedAt.getTime() > startedAt.getTime())) {
      throw new BadRequestException('Eindtijd moet na de starttijd liggen');
    }

    const stillUnassigned =
      entry.needsProjectAssignment && !effProjectId && effActivity !== TimeActivityType.OVERIG;
    if (effActivity !== TimeActivityType.OVERIG && !effProjectId && !stillUnassigned) {
      throw new BadRequestException('Project is verplicht voor deze activiteit');
    }
    const clearsAssignment = entry.needsProjectAssignment && !stillUnassigned;

    await this.assertEntryFksInOrg(user, {
      projectId: dto.projectId ?? undefined,
      inspectionPlanId: dto.inspectionPlanId ?? undefined,
      planningItemId: dto.planningItemId ?? undefined,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      // Verschuift de regel naar een andere ISO-week → herkoppel de weekstaat.
      let timesheetId = entry.timesheetId;
      if (dto.startedAt) {
        const oldWeek = isoWeekOf(entry.startedAt);
        const newWeek = isoWeekOf(startedAt);
        if (oldWeek.year !== newWeek.year || oldWeek.week !== newWeek.week) {
          timesheetId = await this.ensureOpenTimesheet(
            tx,
            entry.orgId,
            entry.userId,
            startedAt,
            !isOwner,
          );
        }
      }

      return tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          activityType: dto.activityType,
          projectId: dto.projectId === undefined ? undefined : dto.projectId,
          inspectionPlanId: dto.inspectionPlanId === undefined ? undefined : dto.inspectionPlanId,
          planningItemId: dto.planningItemId === undefined ? undefined : dto.planningItemId,
          startedAt: dto.startedAt ? startedAt : undefined,
          endedAt: dto.endedAt ? endedAt : undefined,
          durationMinutes: endedAt ? durationMinutesBetween(startedAt, endedAt) : undefined,
          stopReason: dto.endedAt && !entry.endedAt ? 'handmatig' : undefined,
          notes: dto.notes === undefined ? undefined : dto.notes,
          needsProjectAssignment: clearsAssignment ? false : undefined,
          correctedById: isOwner ? undefined : user.id,
          timesheetId,
        },
        include: ENTRY_INCLUDE,
      });
    });

    if (clearsAssignment && entry.assignmentTaskId) {
      this.completeAssignmentTask(entry.assignmentTaskId).catch((err) =>
        this.logger.error('Afronden toewijs-taak mislukt', err),
      );
    }
    return updated;
  }

  async remove(id: string, user: User) {
    const entry = await this.loadEntry(id, user);
    const isOwner = entry.userId === user.id;
    const isManager = user.roles.some((r) => (MANAGEMENT_ROLES as readonly Role[]).includes(r));
    if (!isOwner && !isManager) {
      throw new ForbiddenException('Alleen de inspecteur zelf of een manager kan deze regel verwijderen');
    }
    this.assertEntryMutable(entry.timesheet?.status ?? TimesheetStatus.CONCEPT, isOwner);

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        isDeleted: true,
        needsProjectAssignment: false,
        correctedById: isOwner ? undefined : user.id,
      },
    });

    if (entry.needsProjectAssignment && entry.assignmentTaskId) {
      this.completeAssignmentTask(entry.assignmentTaskId).catch((err) =>
        this.logger.error('Afronden toewijs-taak mislukt', err),
      );
    }
    return { deleted: true };
  }

  // ─── Sync-push (PWA offline-buffer, PRD-16 fase 2) ─────

  /**
   * Additieve `/sync`-push-entiteit `timeEntries` (zelfde patroon als chat):
   * de eigenaar komt altijd uit de JWT, het client-UUID wordt geadopteerd als
   * server-id én `clientId` (idempotente retry). Alleen afgeronde regels —
   * een lopende timer is device-lokale staat en wordt pas gepusht ná de stop.
   */
  async applySyncChange(
    user: User,
    operation: 'create' | 'update' | 'delete',
    data: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const orgId = requireOrg(user);
    const clientId = String(data.id ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
      throw new BadRequestException('Urenregel mist een geldig id');
    }

    const existing = await this.prisma.timeEntry.findUnique({
      where: { orgId_clientId: { orgId, clientId } },
      include: { timesheet: { select: { id: true, status: true } } },
    });

    if (operation === 'delete') {
      if (!existing || existing.isDeleted) return { id: clientId }; // idempotent
      if (existing.userId !== user.id) {
        throw new ForbiddenException('Deze urenregel hoort niet bij jouw account');
      }
      this.assertEntryMutable(existing.timesheet?.status ?? TimesheetStatus.CONCEPT, true);
      await this.prisma.timeEntry.update({
        where: { id: existing.id },
        data: { isDeleted: true, needsProjectAssignment: false },
      });
      if (existing.needsProjectAssignment && existing.assignmentTaskId) {
        this.completeAssignmentTask(existing.assignmentTaskId).catch((err) =>
          this.logger.error('Afronden toewijs-taak mislukt', err),
        );
      }
      return { id: existing.id };
    }

    const parsed = this.parseSyncPayload(data);

    if (operation === 'create' && existing) return { id: existing.id }; // idempotente retry

    if (!existing) {
      // create — of een update op een regel die de server nog niet kent
      // (offline aangemaakt én gewijzigd vóór de eerste push): pas toe als create.
      const needsProjectAssignment = this.resolveProjectRule(
        parsed.activityType,
        parsed.projectId,
        parsed.source,
      );
      await this.assertEntryFksInOrg(user, parsed);

      const entry = await this.prisma.$transaction(async (tx) => {
        const timesheetId = await this.ensureOpenTimesheet(
          tx,
          orgId,
          user.id,
          parsed.startedAt,
          false,
        );
        return tx.timeEntry.create({
          data: {
            id: clientId,
            orgId,
            userId: user.id,
            activityType: parsed.activityType,
            source: parsed.source,
            projectId: parsed.projectId,
            inspectionPlanId: parsed.inspectionPlanId,
            planningItemId: parsed.planningItemId,
            startedAt: parsed.startedAt,
            endedAt: parsed.endedAt,
            durationMinutes: durationMinutesBetween(parsed.startedAt, parsed.endedAt),
            stopReason: parsed.stopReason,
            notes: parsed.notes,
            needsProjectAssignment,
            clientId,
            timesheetId,
          },
          select: { id: true },
        });
      });
      if (needsProjectAssignment) {
        this.createAssignmentTask(entry.id, orgId, user.id, parsed.startedAt).catch((err) =>
          this.logger.error('Aanmaken toewijs-taak mislukt', err),
        );
      }
      return entry;
    }

    // update op een bestaande regel — eigenaar-semantiek (de PWA is de inspecteur zelf)
    if (existing.userId !== user.id) {
      throw new ForbiddenException('Deze urenregel hoort niet bij jouw account');
    }
    this.assertEntryMutable(existing.timesheet?.status ?? TimesheetStatus.CONCEPT, true);

    const stillUnassigned =
      existing.needsProjectAssignment &&
      !parsed.projectId &&
      parsed.activityType !== TimeActivityType.OVERIG;
    if (
      parsed.activityType !== TimeActivityType.OVERIG &&
      !parsed.projectId &&
      !stillUnassigned
    ) {
      throw new BadRequestException('Project is verplicht voor deze activiteit');
    }
    const clearsAssignment = existing.needsProjectAssignment && !stillUnassigned;
    await this.assertEntryFksInOrg(user, parsed);

    const updated = await this.prisma.$transaction(async (tx) => {
      let timesheetId = existing.timesheetId;
      const oldWeek = isoWeekOf(existing.startedAt);
      const newWeek = isoWeekOf(parsed.startedAt);
      if (oldWeek.year !== newWeek.year || oldWeek.week !== newWeek.week) {
        timesheetId = await this.ensureOpenTimesheet(tx, orgId, user.id, parsed.startedAt, false);
      }
      return tx.timeEntry.update({
        where: { id: existing.id },
        data: {
          activityType: parsed.activityType,
          projectId: parsed.projectId,
          inspectionPlanId: parsed.inspectionPlanId,
          planningItemId: parsed.planningItemId,
          startedAt: parsed.startedAt,
          endedAt: parsed.endedAt,
          durationMinutes: durationMinutesBetween(parsed.startedAt, parsed.endedAt),
          stopReason: parsed.stopReason,
          notes: parsed.notes,
          needsProjectAssignment: clearsAssignment ? false : undefined,
          timesheetId,
        },
        select: { id: true },
      });
    });
    if (clearsAssignment && existing.assignmentTaskId) {
      this.completeAssignmentTask(existing.assignmentTaskId).catch((err) =>
        this.logger.error('Afronden toewijs-taak mislukt', err),
      );
    }
    return updated;
  }

  /** Payload-validatie voor de sync-push (Beheer-veldnamen, alles behalve id/notes verplicht-ish). */
  private parseSyncPayload(data: Record<string, unknown>): {
    activityType: TimeActivityType;
    source: TimeEntrySource;
    projectId: string | null;
    inspectionPlanId: string | null;
    planningItemId: string | null;
    startedAt: Date;
    endedAt: Date;
    stopReason: string | null;
    notes: string | null;
  } {
    const activityType = data.activityType as TimeActivityType;
    if (!Object.values(TimeActivityType).includes(activityType)) {
      throw new BadRequestException('Onbekende activiteit');
    }
    const rawSource = data.source as TimeEntrySource | undefined;
    const source =
      rawSource && Object.values(TimeEntrySource).includes(rawSource) && rawSource !== TimeEntrySource.CORRECTIE
        ? rawSource
        : TimeEntrySource.HANDMATIG;

    const startedAt = new Date(String(data.startedAt ?? ''));
    const endedAt = data.endedAt ? new Date(String(data.endedAt)) : null;
    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('Ongeldige starttijd');
    }
    if (!endedAt || Number.isNaN(endedAt.getTime())) {
      // Lopende timers blijven device-lokaal; alleen afgeronde regels syncen.
      throw new BadRequestException('Alleen afgeronde urenregels kunnen gesynchroniseerd worden');
    }
    if (!(endedAt.getTime() > startedAt.getTime())) {
      throw new BadRequestException('Eindtijd moet na de starttijd liggen');
    }

    const uuidOrNull = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v : null;

    return {
      activityType,
      source,
      projectId: uuidOrNull(data.projectId),
      inspectionPlanId: uuidOrNull(data.inspectionPlanId),
      planningItemId: uuidOrNull(data.planningItemId),
      startedAt,
      endedAt,
      stopReason: typeof data.stopReason === 'string' ? data.stopReason.slice(0, 100) : null,
      notes: typeof data.notes === 'string' ? data.notes.slice(0, 2000) : null,
    };
  }

  // ─── Interne helpers ───────────────────────────────────

  private isStaffViewer(user: User): boolean {
    return user.roles.some((r) => (CRM_ROLES as readonly Role[]).includes(r));
  }

  private parseStartedAt(value: string | undefined): Date {
    if (!value) return new Date();
    const parsed = new Date(value);
    const now = Date.now();
    if (parsed.getTime() > now + CLOCK_SKEW_MS) {
      throw new BadRequestException('Starttijd kan niet in de toekomst liggen');
    }
    if (parsed.getTime() < now - MAX_BACKDATE_MS) {
      throw new BadRequestException('Starttijd mag maximaal 12 uur terug liggen');
    }
    return parsed;
  }

  /**
   * Projectregel (PRD-16 §4.3): project verplicht behalve bij OVERIG; alleen een
   * REIS_AUTO-start mag tijdelijk zonder project (→ needsProjectAssignment).
   */
  private resolveProjectRule(
    activityType: TimeActivityType,
    projectId: string | null,
    source: TimeEntrySource,
  ): boolean {
    if (activityType === TimeActivityType.OVERIG || projectId) return false;
    if (source === TimeEntrySource.REIS_AUTO) return true;
    throw new BadRequestException('Project is verplicht voor deze activiteit');
  }

  private async assertEntryFksInOrg(
    user: User,
    dto: { projectId?: string | null; inspectionPlanId?: string | null; planningItemId?: string | null },
  ): Promise<void> {
    await assertSameOrg(this.prisma.project, dto.projectId, user.orgId, 'Project');
    await assertSameOrg(this.prisma.inspectionPlan, dto.inspectionPlanId, user.orgId, 'Inspectieplan');
    await assertSameOrg(this.prisma.planningItem, dto.planningItemId, user.orgId, 'Planning-item');
  }

  private async loadEntry(id: string, user: User) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, ...orgScope(user), isDeleted: false },
      include: { timesheet: { select: { id: true, status: true } } },
    });
    return assertFound(entry, 'Urenregel');
  }

  /**
   * Mutatieregels per weekstaat-status: de inspecteur zelf alleen op
   * CONCEPT/AFGEWEZEN; een manager-correctie ook op INGEDIEND; GOEDGEKEURD is
   * altijd bevroren.
   */
  private assertEntryMutable(status: TimesheetStatus, isOwner: boolean): void {
    if (status === TimesheetStatus.GOEDGEKEURD) {
      throw new ConflictException('Deze weekstaat is goedgekeurd en kan niet meer gewijzigd worden');
    }
    if (isOwner && status === TimesheetStatus.INGEDIEND) {
      throw new ConflictException('Deze weekstaat is ingediend; vraag een manager om een correctie');
    }
  }

  private async stopRunningTx(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    stopReason: string,
  ): Promise<{ id: string } | null> {
    const running = await tx.timeEntry.findFirst({
      where: { orgId, userId, endedAt: null, isDeleted: false },
      select: { id: true, startedAt: true },
    });
    if (!running) return null;
    const endedAt = new Date();
    await tx.timeEntry.update({
      where: { id: running.id },
      data: {
        endedAt,
        durationMinutes: durationMinutesBetween(running.startedAt, endedAt),
        stopReason,
      },
    });
    return { id: running.id };
  }

  /**
   * Weekstaat van de ISO-week van `startedAt` lazy aanmaken (upsert op
   * `@@unique([orgId, userId, year, weekNumber])`) en bewaken dat er nog in
   * geschreven mag worden.
   */
  private async ensureOpenTimesheet(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    startedAt: Date,
    allowSubmittedForCorrection: boolean,
  ): Promise<string> {
    const { year, week } = isoWeekOf(startedAt);
    const timesheet = await tx.timesheet.upsert({
      where: { orgId_userId_year_weekNumber: { orgId, userId, year, weekNumber: week } },
      create: { orgId, userId, year, weekNumber: week },
      update: {},
      select: { id: true, status: true },
    });
    if (timesheet.status === TimesheetStatus.GOEDGEKEURD) {
      throw new ConflictException('De weekstaat van deze week is al goedgekeurd');
    }
    if (timesheet.status === TimesheetStatus.INGEDIEND && !allowSubmittedForCorrection) {
      throw new ConflictException('De weekstaat van deze week is al ingediend');
    }
    return timesheet.id;
  }

  /** Todo-taak "reistijd toewijzen" (PRD-16 §6.2) — buiten de starttransactie. */
  private async createAssignmentTask(
    entryId: string,
    orgId: string,
    userId: string,
    startedAt: Date,
  ): Promise<void> {
    const task = await this.prisma.task.create({
      data: {
        orgId,
        title: `Reistijd van ${formatDateNl(startedAt)} aan een project toewijzen`,
        description:
          'Automatisch gestarte reistijd zonder gepland agenda-item. Koppel de urenregel aan een project (of activiteit Overig) vóór het indienen van de weekstaat.',
        taskType: TaskType.TO_DO,
        entityType: TaskEntityType.TIME_ENTRY,
        entityId: entryId,
        assigneeId: userId,
        createdById: userId,
      },
      select: { id: true },
    });
    await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: { assignmentTaskId: task.id },
    });
  }

  private async completeAssignmentTask(taskId: string): Promise<void> {
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.VOLTOOID },
    });
  }
}
