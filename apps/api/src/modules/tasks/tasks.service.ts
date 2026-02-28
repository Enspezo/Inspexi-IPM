import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma, TaskEntityType, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from './dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

const statusLabels: Record<string, string> = {
  TE_DOEN: 'Te doen',
  MEE_BEZIG: 'Mee bezig',
  VOLTOOID: 'Voltooid',
};

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Resolve entity display names for a list of tasks.
   * Batches lookups per entity type for efficiency.
   */
  private async enrichWithEntityNames(
    tasks: Array<{ entityType: TaskEntityType; entityId: string }>,
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    const contactIds = tasks
      .filter((t) => t.entityType === TaskEntityType.CONTACT)
      .map((t) => t.entityId);
    const requestIds = tasks
      .filter((t) => t.entityType === TaskEntityType.REQUEST)
      .map((t) => t.entityId);
    const quoteIds = tasks
      .filter((t) => t.entityType === TaskEntityType.QUOTE)
      .map((t) => t.entityId);

    if (contactIds.length > 0) {
      const contacts = await this.prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
      });
      for (const c of contacts) {
        const name = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
        nameMap.set(c.id, name);
      }
    }

    if (requestIds.length > 0) {
      const requests = await this.prisma.request.findMany({
        where: { id: { in: requestIds } },
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

    const planningIds = tasks
      .filter((t) => t.entityType === TaskEntityType.PLANNING)
      .map((t) => t.entityId);

    if (planningIds.length > 0) {
      const items = await this.prisma.planningItem.findMany({
        where: { id: { in: planningIds } },
        select: { id: true, productName: true },
      });
      for (const item of items) {
        nameMap.set(item.id, item.productName);
      }
    }

    return nameMap;
  }

  async findAll(user: User, query: ListTasksQueryDto) {
    const { search, status, entityType, entityId, onlyMine, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {};

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (status) {
      where.status = status;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (onlyMine === 'true') {
      where.assigneeId = user.id;
    }

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: userSelect },
          createdBy: { select: userSelect },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    // Enrich with entity names
    const nameMap = await this.enrichWithEntityNames(data);
    const enrichedData = data.map((task) => ({
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    }));

    return { data: enrichedData, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: userSelect },
        createdBy: { select: userSelect },
      },
    });

    if (!task) {
      throw new NotFoundException('Taak niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && task.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze taak');
    }

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([task]);
    return {
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    };
  }

  async create(dto: CreateTaskDto, user: User) {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        entityType: dto.entityType,
        entityId: dto.entityId,
        assigneeId: dto.assigneeId || null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        orgId: user.roles.includes(Role.SUPERUSER) && !user.orgId ? '' : user.orgId!,
        createdById: user.id,
      },
      include: {
        assignee: { select: userSelect },
        createdBy: { select: userSelect },
      },
    });

    // Notify the assignee (if assigned to someone other than the creator)
    if (task.assigneeId && task.assigneeId !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.TAAK_TOEGEWEZEN,
        orgId: task.orgId,
        recipientUserIds: [task.assigneeId],
        title: 'Taak toegewezen',
        body: `Taak "${task.title}" is aan u toegewezen.`,
        entityType: 'task',
        entityId: task.id,
      });
    }

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([task]);
    return {
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    };
  }

  async update(id: string, dto: UpdateTaskDto, user: User) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Taak niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze taak');
    }

    const oldStatus = existing.status;
    const oldAssigneeId = existing.assigneeId;

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.deadline !== undefined) {
      data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    }

    const task = await this.prisma.task.update({
      where: { id: existing.id },
      data,
      include: {
        assignee: { select: userSelect },
        createdBy: { select: userSelect },
      },
    });

    // Notify on assignment change
    if (dto.assigneeId && dto.assigneeId !== oldAssigneeId && dto.assigneeId !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.TAAK_TOEGEWEZEN,
        orgId: task.orgId,
        recipientUserIds: [dto.assigneeId],
        title: 'Taak toegewezen',
        body: `Taak "${task.title}" is aan u toegewezen.`,
        entityType: 'task',
        entityId: task.id,
      });
    }

    // Notify on status change (to assignee and/or creator)
    if (dto.status && dto.status !== oldStatus) {
      const recipientIds = new Set<string>();
      if (task.assigneeId && task.assigneeId !== user.id) {
        recipientIds.add(task.assigneeId);
      }
      if (task.createdById !== user.id) {
        recipientIds.add(task.createdById);
      }

      if (recipientIds.size > 0) {
        const newStatusLabel = statusLabels[dto.status] || dto.status;
        this.notifications.dispatch({
          type: NotificationType.TAAK_STATUS_GEWIJZIGD,
          orgId: task.orgId,
          recipientUserIds: Array.from(recipientIds),
          title: 'Taakstatus gewijzigd',
          body: `Status van taak "${task.title}" is gewijzigd naar ${newStatusLabel}.`,
          entityType: 'task',
          entityId: task.id,
        });
      }
    }

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([task]);
    return {
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    };
  }

  async remove(id: string, user: User) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Taak niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && existing.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze taak');
    }

    await this.prisma.task.delete({
      where: { id: existing.id },
    });
  }
}
