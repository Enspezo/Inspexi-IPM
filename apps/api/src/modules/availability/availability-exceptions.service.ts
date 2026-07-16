import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityException, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, isManagement, isSuperuser } from '@/common';
import {
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
  ListAvailabilityExceptionsQueryDto,
} from './dto';
import {
  ExceptionInput,
  toExceptionData,
  validateExceptionInput,
} from './availability-exception.helpers';
import { AvailabilityNotifier } from './availability-notifier.service';
import { dateKeyToUTC } from './availability-resolution.helpers';

@Injectable()
export class AvailabilityExceptionsService {
  constructor(
    private prisma: PrismaService,
    private notifier: AvailabilityNotifier,
  ) {}

  /**
   * Lijst uitzonderingen. Zonder `userId`: de eigen uitzonderingen. Andermans
   * uitzonderingen alleen voor MANAGEMENT_ROLES. `from`/`to` filtert eenmalige
   * op datumbereik-overlap; herhalende zolang hun recur-periode het bereik raakt.
   */
  async findAll(actor: User, query: ListAvailabilityExceptionsQueryDto) {
    const targetUserId = query.userId ?? actor.id;
    if (targetUserId !== actor.id && !isManagement(actor)) {
      throw new ForbiddenException('U mag deze uitzonderingen niet inzien');
    }
    await this.assertUserInScope(targetUserId, actor);

    const where: Prisma.AvailabilityExceptionWhereInput = {
      userId: targetUserId,
      isDeleted: false,
      ...this.rangeFilter(query.from, query.to),
    };

    return this.prisma.availabilityException.findMany({
      where,
      orderBy: [{ isRecurring: 'asc' }, { startsAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(actor: User, dto: CreateAvailabilityExceptionDto) {
    const target = await this.assertUserWritable(dto.userId, actor);

    const input = this.buildInput(dto);
    validateExceptionInput(input);

    const created = await this.prisma.availabilityException.create({
      data: {
        orgId: target.orgId!,
        userId: dto.userId,
        createdById: actor.id,
        ...toExceptionData(input),
      },
    });

    this.notifier.exceptionChanged(actor, dto.userId, target.orgId, created.id, 'aangemaakt');
    return created;
  }

  async update(id: string, actor: User, dto: UpdateAvailabilityExceptionDto) {
    const existing = await this.getWritableException(id, actor);

    // Merge de bestaande waarden met de aangeleverde velden en hervalideer het geheel.
    const input = this.mergeInput(existing, dto);
    validateExceptionInput(input);

    const updated = await this.prisma.availabilityException.update({
      where: { id },
      data: toExceptionData(input),
    });

    this.notifier.exceptionChanged(actor, existing.userId, existing.orgId, updated.id, 'gewijzigd');
    return updated;
  }

  async remove(id: string, actor: User) {
    const existing = await this.getWritableException(id, actor);
    await this.prisma.availabilityException.update({
      where: { id },
      data: { isDeleted: true },
    });
    this.notifier.exceptionChanged(actor, existing.userId, existing.orgId, existing.id, 'verwijderd');
  }

  // ─── Autorisatie / scoping ────────────────────────────────

  /** Doelgebruiker moet bestaan en (voor niet-superusers) bij de org van de actor horen. */
  private async assertUserInScope(userId: string, actor: User) {
    const target = assertFound(
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, orgId: true },
      }),
      'Gebruiker',
    );
    if (!isSuperuser(actor) && target.orgId !== actor.orgId) {
      throw new NotFoundException('Gebruiker niet gevonden');
    }
    return target;
  }

  /** Schrijfrecht op een uitzondering voor `userId`: eigenaar óf MANAGEMENT_ROLES. */
  private async assertUserWritable(userId: string, actor: User) {
    const target = await this.assertUserInScope(userId, actor);
    if (userId !== actor.id && !isManagement(actor)) {
      throw new ForbiddenException('U mag alleen uw eigen beschikbaarheid beheren');
    }
    return target;
  }

  /** Laadt een uitzondering en dwingt hetzelfde schrijfrecht af (org-scoped, 404 bij lek). */
  private async getWritableException(id: string, actor: User): Promise<AvailabilityException> {
    const existing = await this.prisma.availabilityException.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Uitzondering niet gevonden');
    }
    if (!isSuperuser(actor) && existing.orgId !== actor.orgId) {
      throw new NotFoundException('Uitzondering niet gevonden');
    }
    if (existing.userId !== actor.id && !isManagement(actor)) {
      throw new ForbiddenException('U mag alleen uw eigen beschikbaarheid beheren');
    }
    return existing;
  }

  // ─── Input-bouw ───────────────────────────────────────────

  private buildInput(dto: CreateAvailabilityExceptionDto): ExceptionInput {
    return {
      type: dto.type,
      isRecurring: dto.isRecurring ?? false,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
      allDay: dto.allDay ?? false,
      weekdays: dto.weekdays ?? [],
      startMinute: dto.startMinute ?? null,
      endMinute: dto.endMinute ?? null,
      intervalWeeks: dto.intervalWeeks ?? 1,
      recurStartDate: dto.recurStartDate ?? null,
      recurEndDate: dto.recurEndDate ?? null,
      reason: dto.reason?.trim() || null,
    };
  }

  /** Overlay de bestaande waarden met de meegegeven update-velden (undefined = ongewijzigd). */
  private mergeInput(
    existing: AvailabilityException,
    dto: UpdateAvailabilityExceptionDto,
  ): ExceptionInput {
    const pick = <T>(next: T | undefined, current: T): T => (next !== undefined ? next : current);
    return {
      type: pick(dto.type, existing.type),
      isRecurring: pick(dto.isRecurring, existing.isRecurring),
      startsAt: pick(dto.startsAt, existing.startsAt?.toISOString() ?? null),
      endsAt: pick(dto.endsAt, existing.endsAt?.toISOString() ?? null),
      allDay: pick(dto.allDay, existing.allDay),
      weekdays: pick(dto.weekdays, existing.weekdays),
      startMinute: pick(dto.startMinute, existing.startMinute),
      endMinute: pick(dto.endMinute, existing.endMinute),
      intervalWeeks: pick(dto.intervalWeeks, existing.intervalWeeks),
      recurStartDate: pick(
        dto.recurStartDate,
        existing.recurStartDate ? existing.recurStartDate.toISOString().slice(0, 10) : null,
      ),
      recurEndDate: pick(
        dto.recurEndDate,
        existing.recurEndDate ? existing.recurEndDate.toISOString().slice(0, 10) : null,
      ),
      // Alleen overschrijven wanneer `reason` daadwerkelijk is meegegeven (partial-PATCH):
      // een lege string wist de reden, `undefined` laat de bestaande waarde staan.
      reason: dto.reason !== undefined ? dto.reason.trim() || null : existing.reason,
    };
  }

  /** from/to-filter: eenmalig op datumbereik-overlap, herhalend op recur-periode-overlap. */
  private rangeFilter(from?: string, to?: string): Prisma.AvailabilityExceptionWhereInput {
    if (!from && !to) return {};
    const fromDate = from ? dateKeyToUTC(from) : undefined;
    const toDate = to ? dateKeyToUTC(to) : undefined;

    const oneOff: Prisma.AvailabilityExceptionWhereInput = {
      isRecurring: false,
      ...(toDate ? { startsAt: { lte: new Date(toDate.getTime() + 86_400_000) } } : {}),
      ...(fromDate ? { endsAt: { gte: fromDate } } : {}),
    };
    const recurring: Prisma.AvailabilityExceptionWhereInput = {
      isRecurring: true,
      ...(toDate ? { recurStartDate: { lte: toDate } } : {}),
      ...(fromDate ? { OR: [{ recurEndDate: null }, { recurEndDate: { gte: fromDate } }] } : {}),
    };

    return { OR: [oneOff, recurring] };
  }
}
