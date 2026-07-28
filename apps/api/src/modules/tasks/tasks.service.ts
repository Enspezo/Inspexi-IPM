import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma, TaskEntityType, TaskType, TaskStatus, LogType, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertFound, assertSameOrg } from '@/common';
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
  private readonly logger = new Logger(TasksService.name);

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

    const projectIds = tasks
      .filter((t) => t.entityType === TaskEntityType.PROJECT)
      .map((t) => t.entityId);

    if (projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: { id: { in: projectIds }, isDeleted: false },
        select: { id: true, title: true, projectNumber: true },
      });
      for (const p of projects) {
        nameMap.set(p.id, `${p.projectNumber} — ${p.title}`);
      }
    }

    const userIds = tasks
      .filter((t) => t.entityType === TaskEntityType.USER)
      .map((t) => t.entityId);

    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, isDeleted: false },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        nameMap.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || '—');
      }
    }

    return nameMap;
  }

  async findAll(user: User, query: ListTasksQueryDto) {
    const { search, status, taskType, entityType, entityId, onlyMine, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['title', 'status', 'taskType', 'entityType', 'deadline', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { createdAt: 'desc' });

    const where: Prisma.TaskWhereInput = { ...orgScope(user) };

    if (status) {
      where.status = status;
    }

    if (taskType) {
      where.taskType = taskType;
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

    const result = await paginate(this.prisma.task, {
      where,
      include: {
        assignee: { select: userSelect },
        createdBy: { select: userSelect },
      },
      orderBy,
      page,
      limit,
    });

    // Enrich with entity names
    const nameMap = await this.enrichWithEntityNames(result.data);
    const enrichedData = result.data.map((task) => ({
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    }));

    return { ...result, data: enrichedData };
  }

  async findOne(id: string, user: User) {
    // Org-scoped lookup: een vreemde-org-id is niet te onderscheiden van een
    // niet-bestaand id (zelfde 404) — geen existence-oracle (B-105).
    const task = assertFound(
      await this.prisma.task.findFirst({
        where: { id, ...orgScope(user) },
        include: {
          assignee: { select: userSelect },
          createdBy: { select: userSelect },
        },
      }),
      'Taak',
    );

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([task]);
    return {
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    };
  }

  /**
   * Verify a task's linked entity belongs to the user's organization, so a tenant
   * cannot attach a task to (and thereby discover the name of) another org's entity.
   */
  private async assertEntityInOrg(
    entityType: TaskEntityType,
    entityId: string,
    orgId: string | null,
  ): Promise<void> {
    switch (entityType) {
      case TaskEntityType.CONTACT:
        return assertSameOrg(this.prisma.contact, entityId, orgId, 'Relatie');
      case TaskEntityType.REQUEST:
        return assertSameOrg(this.prisma.request, entityId, orgId, 'Aanvraag');
      case TaskEntityType.QUOTE:
        return assertSameOrg(this.prisma.quote, entityId, orgId, 'Offerte');
      case TaskEntityType.PLANNING:
        return assertSameOrg(this.prisma.planningItem, entityId, orgId, 'Planning');
      case TaskEntityType.PROJECT:
        return assertSameOrg(this.prisma.project, entityId, orgId, 'Project');
      case TaskEntityType.USER:
        return assertSameOrg(this.prisma.user, entityId, orgId, 'Gebruiker');
    }
  }

  async create(dto: CreateTaskDto, user: User) {
    // Linked entity and assignee must belong to the user's organization
    if (dto.entityId) {
      await this.assertEntityInOrg(dto.entityType, dto.entityId, user.orgId);
    }
    await assertSameOrg(this.prisma.user, dto.assigneeId, user.orgId, 'Toegewezen gebruiker');

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        taskType: dto.taskType,
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
    const existing = assertFound(
      await this.prisma.task.findFirst({ where: { id, ...orgScope(user) } }),
      'Taak',
    );

    const oldStatus = existing.status;
    const oldAssigneeId = existing.assigneeId;

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.taskType !== undefined) data.taskType = dto.taskType;
    if (dto.assigneeId !== undefined) {
      await assertSameOrg(this.prisma.user, dto.assigneeId, user.orgId, 'Toegewezen gebruiker');
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

    // Auto-create ContactLog when EMAIL/TELEFOONGESPREK task is completed
    if (
      dto.status === TaskStatus.VOLTOOID &&
      oldStatus !== TaskStatus.VOLTOOID &&
      (task.taskType === TaskType.EMAIL || task.taskType === TaskType.TELEFOONGESPREK)
    ) {
      this.createContactLogForTask(task, user).catch((err) => {
        this.logger.error(`Failed to create ContactLog for task ${task.id}: ${err.message}`);
      });
    }

    // Enrich with entity name
    const nameMap = await this.enrichWithEntityNames([task]);
    return {
      ...task,
      entityName: nameMap.get(task.entityId) || null,
    };
  }

  private async resolveContactId(
    entityType: TaskEntityType,
    entityId: string,
  ): Promise<string | null> {
    switch (entityType) {
      case TaskEntityType.CONTACT:
        return entityId;
      case TaskEntityType.REQUEST: {
        const request = await this.prisma.request.findUnique({
          where: { id: entityId },
          select: { contactId: true },
        });
        return request?.contactId ?? null;
      }
      case TaskEntityType.QUOTE: {
        const quote = await this.prisma.quote.findUnique({
          where: { id: entityId },
          select: { contactId: true },
        });
        return quote?.contactId ?? null;
      }
      default:
        return null;
    }
  }

  private async createContactLogForTask(
    task: { id: string; title: string; description: string | null; taskType: TaskType; entityType: TaskEntityType; entityId: string; orgId: string },
    user: User,
  ): Promise<void> {
    const contactId = await this.resolveContactId(task.entityType, task.entityId);
    if (!contactId) {
      this.logger.debug(
        `Skipping ContactLog for task ${task.id}: no contact linked to ${task.entityType} ${task.entityId}`,
      );
      return;
    }

    const logType = task.taskType === TaskType.EMAIL ? LogType.EMAIL : LogType.PHONE;

    await this.prisma.contactLog.create({
      data: {
        contactId,
        orgId: task.orgId,
        userId: user.id,
        type: logType,
        subject: task.title,
        body: task.description,
        loggedAt: new Date(),
      },
    });

    this.logger.debug(
      `Created ContactLog (${logType}) for contact ${contactId} from task ${task.id}`,
    );
  }

  async remove(id: string, user: User) {
    const existing = assertFound(
      await this.prisma.task.findFirst({ where: { id, ...orgScope(user) } }),
      'Taak',
    );

    await this.prisma.task.delete({
      where: { id: existing.id },
    });
  }
}
