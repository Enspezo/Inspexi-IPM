import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityExceptionType, EmploymentType, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope } from '@/common';
import {
  DaySource,
  ExceptionLike,
  Interval,
  dateKeyOf,
  dateKeyToUTC,
  diffDays,
  eachDateKey,
  expandException,
  intersectIntervals,
  isoWeekday,
  resolveDay,
  subtractIntervals,
} from './availability-resolution.helpers';

/** Berekend eindresultaat per inspecteur per dag (PRD §12.5). */
export interface DayResolution {
  userId: string;
  date: string; // YYYY-MM-DD
  intervals: Interval[];
  isAvailable: boolean;
  sources: DaySource[];
}

/** Eén conflict binnen een `check`-venster: het niet-gedekte deel + reden. */
export interface AvailabilityConflict {
  date: string;
  startMinute: number;
  endMinute: number;
  reason: string;
}

export interface CheckResult {
  available: boolean;
  coveredIntervals: { date: string; startMinute: number; endMinute: number }[];
  conflicts: AvailabilityConflict[];
}

const MAX_RANGE_DAYS = 93; // ~3 maanden

type AssignmentWithSlots = Prisma.UserScheduleAssignmentGetPayload<{
  include: { template: { include: { slots: true } } };
}>;

interface ResolutionContext {
  employmentByUser: Map<string, EmploymentType | null>;
  assignmentsByUser: Map<string, AssignmentWithSlots[]>;
  exceptionsByUser: Map<string, ExceptionLike[]>;
}

/** Rijkere per-dag-uitkomst voor intern gebruik (check heeft de blokkades nodig). */
interface DayComputation {
  intervals: Interval[];
  sources: DaySource[];
  blocking: ExceptionLike[]; // GEBLOKKEERD-excepties die deze dag raakten
}

const MS_PER_DAY = 86_400_000;

@Injectable()
export class AvailabilityResolutionService {
  constructor(private prisma: PrismaService) {}

  // ─── Resolved ─────────────────────────────────────────────

  /**
   * Resolved availability voor een set gebruikers over een datumbereik (inclusief).
   * Zonder `userIds` worden alle INSPECTEUR-gebruikers van de org genomen.
   */
  async resolve(
    actor: User,
    fromKey: string,
    toKey: string,
    userIds?: string[],
  ): Promise<DayResolution[]> {
    this.assertRange(fromKey, toKey);

    const ids = userIds?.length
      ? await this.scopeUserIds(actor, userIds)
      : await this.orgInspectorIds(actor);
    if (ids.length === 0) return [];

    const ctx = await this.buildContext(ids, fromKey, toKey);
    const days = eachDateKey(fromKey, toKey);

    const out: DayResolution[] = [];
    for (const userId of ids) {
      for (const date of days) {
        const { intervals, sources } = this.computeDay(userId, date, ctx);
        out.push({ userId, date, intervals, isAvailable: intervals.length > 0, sources });
      }
    }
    return out;
  }

  // ─── Check ────────────────────────────────────────────────

  /**
   * Is `userId` volledig beschikbaar tussen `start` en `end`? Retourneert de
   * gedekte delen en, per niet-gedekt deel, een leesbare NL-reden.
   */
  async check(actor: User, userId: string, startISO: string, endISO: string): Promise<CheckResult> {
    const scoped = await this.scopeUserIds(actor, [userId]);
    if (scoped.length === 0) {
      throw new NotFoundException('Gebruiker niet gevonden');
    }

    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Ongeldige start- of eindtijd');
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Eindtijd moet na de starttijd liggen');
    }

    const fromKey = dateKeyOf(start);
    const toKey = dateKeyOf(new Date(end.getTime() - 1)); // exclusief einde
    this.assertRange(fromKey, toKey);

    const ctx = await this.buildContext([userId], fromKey, toKey);

    const covered: CheckResult['coveredIntervals'] = [];
    const conflicts: AvailabilityConflict[] = [];

    for (const date of eachDateKey(fromKey, toKey)) {
      const requested = this.requestedWindow(date, start, end);
      if (requested.length === 0) continue;

      const { intervals, blocking } = this.computeDay(userId, date, ctx);

      for (const iv of intersectIntervals(requested, intervals)) {
        covered.push({ date, startMinute: iv.startMinute, endMinute: iv.endMinute });
      }
      for (const gap of subtractIntervals(requested, intervals)) {
        conflicts.push({
          date,
          startMinute: gap.startMinute,
          endMinute: gap.endMinute,
          reason: this.gapReason(gap, date, blocking),
        });
      }
    }

    return { available: conflicts.length === 0, coveredIntervals: covered, conflicts };
  }

  // ─── Kern per dag ─────────────────────────────────────────

  private computeDay(userId: string, date: string, ctx: ResolutionContext): DayComputation {
    const sources: DaySource[] = [];

    // 1. Baseline (alleen dienstverband met een op deze dag geldige toewijzing).
    let baseline: Interval[] = [];
    if (ctx.employmentByUser.get(userId) === EmploymentType.DIENSTVERBAND) {
      const assignment = this.activeAssignment(ctx.assignmentsByUser.get(userId) ?? [], date);
      if (assignment) {
        const weekday = isoWeekday(date);
        baseline = assignment.template.slots
          .filter((s) => s.weekday === weekday)
          .map((s) => ({ startMinute: s.startMinute, endMinute: s.endMinute }));
        if (baseline.length > 0) {
          sources.push({ kind: 'TEMPLATE', id: assignment.templateId });
        }
      }
    }

    // 2/3. Plus- en min-laag uit de excepties die deze dag raken.
    const plus: Interval[] = [];
    const minus: Interval[] = [];
    const blocking: ExceptionLike[] = [];
    for (const exc of ctx.exceptionsByUser.get(userId) ?? []) {
      const hit = expandException(exc, date);
      if (hit.length === 0) continue;
      sources.push({ kind: 'EXCEPTION', id: exc.id, type: exc.type });
      if (exc.type === AvailabilityExceptionType.BESCHIKBAAR) {
        plus.push(...hit);
      } else {
        minus.push(...hit);
        blocking.push(exc);
      }
    }

    return { intervals: resolveDay(baseline, plus, minus), sources, blocking };
  }

  /** De schema-toewijzing die geldig is op `date` (validFrom ≤ date < validUntil). */
  private activeAssignment(
    assignments: AssignmentWithSlots[],
    date: string,
  ): AssignmentWithSlots | null {
    let best: AssignmentWithSlots | null = null;
    for (const a of assignments) {
      if (diffDays(dateKeyOf(a.validFrom), date) < 0) continue; // validFrom > date
      if (a.validUntil && diffDays(date, dateKeyOf(a.validUntil)) <= 0) continue; // validUntil ≤ date
      if (!best || a.validFrom > best.validFrom) best = a;
    }
    return best;
  }

  private gapReason(gap: Interval, date: string, blocking: ExceptionLike[]): string {
    for (const exc of blocking) {
      const [hit] = expandException(exc, date);
      if (hit && hit.startMinute < gap.endMinute && hit.endMinute > gap.startMinute) {
        return exc.reason?.trim() || 'Geblokkeerd in deze periode';
      }
    }
    return 'Geen beschikbaarheid';
  }

  /** Het aangevraagde venster (minuten) binnen dag `date`, geknipt op de dag. */
  private requestedWindow(date: string, start: Date, end: Date): Interval[] {
    const dayStart = dateKeyToUTC(date).getTime();
    const dayEnd = dayStart + MS_PER_DAY;
    const from = Math.max(start.getTime(), dayStart);
    const to = Math.min(end.getTime(), dayEnd);
    if (from >= to) return [];
    return [
      {
        startMinute: Math.floor((from - dayStart) / 60_000),
        endMinute: Math.floor((to - dayStart) / 60_000),
      },
    ];
  }

  // ─── Batched data-ophaal ──────────────────────────────────

  private async buildContext(
    userIds: string[],
    fromKey: string,
    toKey: string,
  ): Promise<ResolutionContext> {
    const fromDate = dateKeyToUTC(fromKey);
    const toDate = dateKeyToUTC(toKey);

    const [users, assignments, exceptions] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, employmentType: true },
      }),
      // Toewijzingen die het bereik overlappen: validFrom ≤ to én (open of validUntil > from).
      this.prisma.userScheduleAssignment.findMany({
        where: {
          userId: { in: userIds },
          validFrom: { lte: toDate },
          OR: [{ validUntil: null }, { validUntil: { gt: fromDate } }],
        },
        include: { template: { include: { slots: true } } },
        orderBy: { validFrom: 'asc' },
      }),
      this.prisma.availabilityException.findMany({
        where: { userId: { in: userIds }, isDeleted: false },
      }),
    ]);

    const employmentByUser = new Map(users.map((u) => [u.id, u.employmentType]));
    const assignmentsByUser = new Map<string, AssignmentWithSlots[]>();
    for (const a of assignments) {
      const list = assignmentsByUser.get(a.userId) ?? [];
      list.push(a);
      assignmentsByUser.set(a.userId, list);
    }
    const exceptionsByUser = new Map<string, ExceptionLike[]>();
    for (const e of exceptions) {
      const list = exceptionsByUser.get(e.userId) ?? [];
      list.push(e);
      exceptionsByUser.set(e.userId, list);
    }

    return { employmentByUser, assignmentsByUser, exceptionsByUser };
  }

  // ─── Autorisatie / scoping ────────────────────────────────

  /** Beperk `userIds` tot de org van de actor; onbekende/andere-org-ids vallen weg. */
  private async scopeUserIds(actor: User, userIds: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, ...orgScope(actor), isDeleted: false },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async orgInspectorIds(actor: User): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { ...orgScope(actor), isDeleted: false, roles: { has: Role.INSPECTEUR } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private assertRange(fromKey: string, toKey: string): void {
    const span = diffDays(fromKey, toKey);
    if (span < 0) {
      throw new BadRequestException('De einddatum moet op of na de begindatum liggen');
    }
    if (span + 1 > MAX_RANGE_DAYS) {
      throw new BadRequestException('Het opgevraagde bereik mag maximaal 3 maanden beslaan');
    }
  }
}
