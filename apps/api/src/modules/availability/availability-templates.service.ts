import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  paginate,
  buildOrderBy,
  orgScope,
  requireOrg,
  isSuperuser,
} from '@/common';
import {
  CreateAvailabilityTemplateDto,
  UpdateAvailabilityTemplateDto,
  ListAvailabilityTemplatesQueryDto,
} from './dto';
import { validateTemplateSlots } from './availability.helpers';

const templateInclude = {
  slots: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
  _count: { select: { assignments: true } },
} satisfies Prisma.AvailabilityTemplateInclude;

type TemplateWithSlots = Prisma.AvailabilityTemplateGetPayload<{
  include: typeof templateInclude;
}>;

const ALLOWED_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'];

@Injectable()
export class AvailabilityTemplatesService {
  constructor(private prisma: PrismaService) {}

  // ─── Reads ──────────────────────────────────────────────

  async findAll(user: User, query: ListAvailabilityTemplatesQueryDto) {
    const { page = 1, limit = 20, sortBy, sortOrder = 'desc', search } = query;
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { name: 'asc' });

    const where: Prisma.AvailabilityTemplateWhereInput = {
      ...orgScope(user),
      isDeleted: false,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const result = await paginate(this.prisma.availabilityTemplate, {
      where,
      include: templateInclude,
      orderBy,
      page,
      limit,
    });

    return {
      ...result,
      data: (result.data as TemplateWithSlots[]).map((t) => this.serialize(t)),
    };
  }

  async findOne(id: string, user: User) {
    return this.serialize(await this.getOwnedTemplate(id, user));
  }

  // ─── Writes ─────────────────────────────────────────────

  async create(user: User, dto: CreateAvailabilityTemplateDto) {
    const orgId = requireOrg(user);
    validateTemplateSlots(dto.slots);

    await this.assertNameFree(orgId, dto.name);

    const created = await this.runNameUnique(() =>
      this.prisma.availabilityTemplate.create({
        data: {
          orgId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          isActive: dto.isActive ?? true,
          slots: {
            create: dto.slots.map((s) => ({
              weekday: s.weekday,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
            })),
          },
        },
        include: templateInclude,
      }),
    );

    return this.serialize(created);
  }

  async update(id: string, user: User, dto: UpdateAvailabilityTemplateDto) {
    const template = await this.getOwnedTemplate(id, user);

    if (dto.slots !== undefined) validateTemplateSlots(dto.slots);
    if (dto.name !== undefined && dto.name.trim() !== template.name) {
      await this.assertNameFree(template.orgId, dto.name, template.id);
    }

    const data: Prisma.AvailabilityTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    // Slots worden integraal vervangen binnen een transactie (delete + recreate).
    const updated = await this.runNameUnique(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.slots !== undefined) {
          await tx.availabilityTemplateSlot.deleteMany({ where: { templateId: id } });
          await tx.availabilityTemplateSlot.createMany({
            data: dto.slots.map((s) => ({
              templateId: id,
              weekday: s.weekday,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
            })),
          });
        }
        return tx.availabilityTemplate.update({
          where: { id },
          data,
          include: templateInclude,
        });
      }),
    );

    return this.serialize(updated);
  }

  /** Soft-delete — geblokkeerd zolang er actieve toewijzingen zijn (validUntil null of in de toekomst). */
  async remove(id: string, user: User) {
    const template = await this.getOwnedTemplate(id, user);

    const activeAssignments = await this.prisma.userScheduleAssignment.count({
      where: {
        templateId: template.id,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
    });
    if (activeAssignments > 0) {
      throw new ConflictException(
        'Template kan niet worden verwijderd: er zijn nog actieve schema-toewijzingen',
      );
    }

    // De naam wordt gemangeld zodat de DB-unique (orgId, name) — die geen
    // isDeleted kent — een nieuwe template met dezelfde naam niet blokkeert.
    await this.prisma.availabilityTemplate.update({
      where: { id },
      data: {
        isDeleted: true,
        name: `${template.name} (verwijderd ${new Date().toISOString()})`,
      },
    });
  }

  // ─── Helpers ────────────────────────────────────────────

  /** Org-scoped fetch: een template uit een andere org resolveert naar 404 (geen leak). */
  private async getOwnedTemplate(id: string, user: User): Promise<TemplateWithSlots> {
    const template = await this.prisma.availabilityTemplate.findUnique({
      where: { id },
      include: templateInclude,
    });
    if (!template || template.isDeleted) {
      throw new NotFoundException('Template niet gevonden');
    }
    if (!isSuperuser(user) && template.orgId !== user.orgId) {
      throw new NotFoundException('Template niet gevonden');
    }
    return template;
  }

  /**
   * Map een P2002 op de (orgId, name)-unique naar een nette 409 i.p.v. een 500.
   * `assertNameFree` + de naam-mangeling in `remove()` vangen het normale geval al
   * af; dit is de vangnet-laag mocht de DB-unique alsnog aanslaan (DB-1).
   */
  private async runNameUnique<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Er bestaat al een template met deze naam');
      }
      throw e;
    }
  }

  /** Naam moet uniek zijn binnen de org (respecteert de @@unique, met NL-melding). */
  private async assertNameFree(orgId: string, name: string, exceptId?: string) {
    const existing = await this.prisma.availabilityTemplate.findFirst({
      where: {
        orgId,
        name: name.trim(),
        isDeleted: false,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Er bestaat al een template met deze naam');
    }
  }

  /** Vervang `_count` door een platte `assignmentCount`. */
  private serialize(template: TemplateWithSlots) {
    const { _count, ...rest } = template;
    return { ...rest, assignmentCount: _count.assignments };
  }
}
