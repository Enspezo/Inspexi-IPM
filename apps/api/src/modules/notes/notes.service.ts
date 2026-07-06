import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma, NoteEntityType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertSameOrg } from '@/common';
import { CreateNoteDto, UpdateNoteDto, ListNotesQueryDto } from './dto';

const createdBySelect = {
  id: true,
  firstName: true,
  lastName: true,
};

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Resolve entity display names for a list of notes.
   * Batches lookups per entity type for efficiency.
   */
  private async enrichWithEntityNames(
    notes: Array<{ entityType: NoteEntityType; entityId: string }>,
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    const contactIds = notes
      .filter((n) => n.entityType === NoteEntityType.CONTACT)
      .map((n) => n.entityId);
    const requestIds = notes
      .filter((n) => n.entityType === NoteEntityType.REQUEST)
      .map((n) => n.entityId);
    const quoteIds = notes
      .filter((n) => n.entityType === NoteEntityType.QUOTE)
      .map((n) => n.entityId);
    const planningIds = notes
      .filter((n) => n.entityType === NoteEntityType.PLANNING)
      .map((n) => n.entityId);
    const projectIds = notes
      .filter((n) => n.entityType === NoteEntityType.PROJECT)
      .map((n) => n.entityId);
    const userIds = notes
      .filter((n) => n.entityType === NoteEntityType.USER)
      .map((n) => n.entityId);

    if (contactIds.length > 0) {
      const contacts = await this.prisma.contact.findMany({
        where: { id: { in: contactIds }, isDeleted: false },
        select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
      });
      for (const c of contacts) {
        const name = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
        nameMap.set(c.id, name);
      }
    }

    if (requestIds.length > 0) {
      const requests = await this.prisma.request.findMany({
        where: { id: { in: requestIds }, isDeleted: false },
        select: { id: true, title: true },
      });
      for (const r of requests) {
        nameMap.set(r.id, r.title);
      }
    }

    if (quoteIds.length > 0) {
      const quotes = await this.prisma.quote.findMany({
        where: { id: { in: quoteIds } },
        select: { id: true, quoteNumber: true },
      });
      for (const q of quotes) {
        nameMap.set(q.id, q.quoteNumber);
      }
    }

    if (planningIds.length > 0) {
      const items = await this.prisma.planningItem.findMany({
        where: { id: { in: planningIds } },
        select: { id: true, productName: true },
      });
      for (const item of items) {
        nameMap.set(item.id, item.productName);
      }
    }

    if (projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: projectIds }, isDeleted: false },
        select: { id: true, title: true, projectNumber: true },
      });
      for (const p of projects) {
        nameMap.set(p.id, `${p.projectNumber} — ${p.title}`);
      }
    }

    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, isDeleted: false },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        nameMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—');
      }
    }

    const workOrderIds = notes
      .filter((n) => n.entityType === NoteEntityType.WORK_ORDER)
      .map((n) => n.entityId);

    if (workOrderIds.length > 0) {
      const workOrders = await this.prisma.workOrder.findMany({
        where: { id: { in: workOrderIds } },
        select: { id: true, workOrderNumber: true },
      });
      for (const wo of workOrders) {
        nameMap.set(wo.id, wo.workOrderNumber);
      }
    }

    return nameMap;
  }

  /**
   * Get threaded notes for a specific entity (for NotesSection component).
   * Returns root notes with their replies nested within.
   */
  async findByEntity(entityType: NoteEntityType, entityId: string, user: User) {
    const where: Prisma.NoteWhereInput = {
      ...orgScope(user),
      entityType,
      entityId,
      parentId: null,
      isDeleted: false,
    };

    const notes = await this.prisma.note.findMany({
      where,
      include: {
        createdBy: { select: createdBySelect },
        replies: {
          where: { isDeleted: false },
          include: { createdBy: { select: createdBySelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return notes;
  }

  /**
   * Paginated list of root notes (for the overview page).
   * Includes reply count and entity name enrichment.
   */
  async findAll(user: User, query: ListNotesQueryDto) {
    const { search, entityType, entityId, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['entityType', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { createdAt: 'desc' });

    const where: Prisma.NoteWhereInput = {
      ...orgScope(user),
      parentId: null,
      isDeleted: false,
    };

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }

    const result = await paginate(this.prisma.note, {
      where,
      include: {
        createdBy: { select: createdBySelect },
        _count: {
          select: { replies: { where: { isDeleted: false } } },
        },
      },
      orderBy,
      page,
      limit,
    });

    const nameMap = await this.enrichWithEntityNames(result.data);
    const enrichedData = result.data.map((note) => ({
      ...note,
      entityName: nameMap.get(note.entityId) || null,
      replyCount: (note as typeof note & { _count: { replies: number } })._count.replies,
      _count: undefined,
    }));

    return { ...result, data: enrichedData };
  }

  async findOne(id: string, user: User) {
    const note = await this.prisma.note.findUnique({
      where: { id },
      include: { createdBy: { select: createdBySelect } },
    });

    if (!note || note.isDeleted) {
      throw new NotFoundException('Notitie niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && note.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze notitie');
    }

    return note;
  }

  /**
   * Verify a note's linked entity belongs to the user's organization, so a tenant
   * cannot attach a note to (and reference) another org's record.
   */
  private async assertEntityInOrg(
    entityType: NoteEntityType,
    entityId: string,
    orgId: string | null,
  ): Promise<void> {
    switch (entityType) {
      case NoteEntityType.CONTACT:
        return assertSameOrg(this.prisma.contact, entityId, orgId, 'Relatie');
      case NoteEntityType.REQUEST:
        return assertSameOrg(this.prisma.request, entityId, orgId, 'Aanvraag');
      case NoteEntityType.QUOTE:
        return assertSameOrg(this.prisma.quote, entityId, orgId, 'Offerte');
      case NoteEntityType.PLANNING:
        return assertSameOrg(this.prisma.planningItem, entityId, orgId, 'Planning');
      case NoteEntityType.PROJECT:
        return assertSameOrg(this.prisma.project, entityId, orgId, 'Project');
      case NoteEntityType.USER:
        return assertSameOrg(this.prisma.user, entityId, orgId, 'Gebruiker');
      case NoteEntityType.WORK_ORDER:
        return assertSameOrg(this.prisma.workOrder, entityId, orgId, 'Werkbon');
    }
  }

  async create(dto: CreateNoteDto, user: User) {
    // Linked entity must belong to the user's organization
    await this.assertEntityInOrg(dto.entityType, dto.entityId, user.orgId);

    // Validate depth: replies to replies are not allowed
    if (dto.parentId) {
      const parent = await this.prisma.note.findUnique({
        where: { id: dto.parentId },
        select: { id: true, parentId: true, orgId: true, isDeleted: true },
      });

      if (!parent || parent.isDeleted) {
        throw new NotFoundException('Parent notitie niet gevonden');
      }

      if (!user.roles.includes(Role.SUPERUSER) && parent.orgId !== user.orgId) {
        throw new ForbiddenException('Geen toegang tot deze notitie');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException('Replies mogen niet op een reply geplaatst worden');
      }
    }

    const note = await this.prisma.note.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        content: dto.content,
        parentId: dto.parentId || null,
        orgId: user.roles.includes(Role.SUPERUSER) && !user.orgId ? '' : user.orgId!,
        createdById: user.id,
      },
      include: { createdBy: { select: createdBySelect } },
    });

    return note;
  }

  async update(id: string, dto: UpdateNoteDto, user: User) {
    const existing = await this.prisma.note.findUnique({ where: { id } });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Notitie niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze notitie');
    }

    const canEdit =
      existing.createdById === user.id ||
      user.roles.includes(Role.ORG_ADMIN) ||
      user.roles.includes(Role.SUPERUSER);

    if (!canEdit) {
      throw new ForbiddenException('U mag alleen uw eigen notities bewerken');
    }

    const note = await this.prisma.note.update({
      where: { id },
      data: { content: dto.content },
      include: { createdBy: { select: createdBySelect } },
    });

    return note;
  }

  async remove(id: string, user: User) {
    const existing = await this.prisma.note.findUnique({ where: { id } });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Notitie niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze notitie');
    }

    const canDelete =
      existing.createdById === user.id ||
      user.roles.includes(Role.ORG_ADMIN) ||
      user.roles.includes(Role.SUPERUSER);

    if (!canDelete) {
      throw new ForbiddenException('U mag alleen uw eigen notities verwijderen');
    }

    // Soft delete to preserve thread context
    await this.prisma.note.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
