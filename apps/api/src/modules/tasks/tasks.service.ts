import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from './dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListTasksQueryDto) {
    const { search, status, entityType, entityId, onlyMine, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {};

    if (user.role !== Role.SUPERUSER) {
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

    return { data, total, page, limit };
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

    if (user.role !== Role.SUPERUSER && task.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot deze taak');
    }

    return task;
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
        orgId: user.role === Role.SUPERUSER && !user.orgId ? '' : user.orgId!,
        createdById: user.id,
      },
      include: {
        assignee: { select: userSelect },
        createdBy: { select: userSelect },
      },
    });

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, user: User) {
    const existing = await this.findOne(id, user);

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

    return task;
  }

  async remove(id: string, user: User) {
    const existing = await this.findOne(id, user);

    await this.prisma.task.delete({
      where: { id: existing.id },
    });
  }
}
