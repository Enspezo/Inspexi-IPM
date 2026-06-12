import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound } from '@/common';
import {
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
  SetWorkOrderLinesDto,
  ListWorkOrdersQueryDto,
} from './dto';

const WORK_ORDER_INCLUDE = {
  planningItem: {
    select: {
      id: true,
      productName: true,
      scheduledDate: true,
      status: true,
      contactId: true,
      locationId: true,
      contact: {
        select: {
          id: true,
          type: true,
          companyName: true,
          firstName: true,
          lastName: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          street: true,
          houseNumber: true,
          city: true,
          postalCode: true,
        },
      },
      inspectors: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  },
  createdByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  lines: {
    include: {
      product: {
        select: { id: true, name: true, unit: true, productGroupId: true },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
};

const WORK_ORDER_LIST_INCLUDE = {
  planningItem: {
    select: {
      id: true,
      productName: true,
      scheduledDate: true,
      contact: {
        select: {
          id: true,
          companyName: true,
          firstName: true,
          lastName: true,
        },
      },
      location: {
        select: {
          id: true,
          street: true,
          houseNumber: true,
          city: true,
          postalCode: true,
        },
      },
    },
  },
  createdByUser: {
    select: { id: true, firstName: true, lastName: true },
  },
};

/**
 * Convert Prisma.Decimal money fields on work-order lines (unitPrice, lineTotal) to plain
 * numbers so the portal receives numbers instead of Decimal-as-string.
 */
function serializeWorkOrder<T extends Record<string, any> | null>(workOrder: T): T {
  if (!workOrder || !Array.isArray((workOrder as any).lines)) return workOrder;
  return {
    ...(workOrder as any),
    lines: (workOrder as any).lines.map((line: any) => ({
      ...line,
      unitPrice: line.unitPrice != null ? Number(line.unitPrice) : line.unitPrice,
      lineTotal: line.lineTotal != null ? Number(line.lineTotal) : line.lineTotal,
    })),
  };
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(private prisma: PrismaService) {}

  private generateWorkOrderNumber(
    postalCode?: string | null,
    houseNumber?: string | null,
  ): string {
    const numericPostal = (postalCode ?? '').replace(/\D/g, '');
    const numericHouse = (houseNumber ?? '').replace(/\D/g, '');
    const base = numericPostal + numericHouse;
    const padded = base.length > 0 ? base : '000000';
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `WB-${padded}${random}`;
  }

  async createFromPlanningItem(data: {
    id: string;
    orgId: string;
    locationId: string | null;
    createdBy: string;
  }) {
    // Check if a work order already exists for this planning item
    const existing = await this.prisma.workOrder.findFirst({
      where: { planningItemId: data.id },
      include: WORK_ORDER_INCLUDE,
    });
    if (existing) {
      this.logger.log(
        `Work order already exists for planning item ${data.id}`,
      );
      return serializeWorkOrder(existing);
    }

    // Fetch location for number generation
    let postalCode: string | null = null;
    let houseNumber: string | null = null;
    if (data.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: data.locationId },
        select: { postalCode: true, houseNumber: true },
      });
      if (location) {
        postalCode = location.postalCode;
        houseNumber = location.houseNumber;
      }
    }

    // Generate unique work order number with retry
    let workOrderNumber: string;
    let attempts = 0;
    while (true) {
      workOrderNumber = this.generateWorkOrderNumber(postalCode, houseNumber);
      try {
        const workOrder = await this.prisma.workOrder.create({
          data: {
            orgId: data.orgId,
            planningItemId: data.id,
            workOrderNumber,
            createdBy: data.createdBy,
          },
          include: WORK_ORDER_INCLUDE,
        });
        this.logger.log(
          `Created work order ${workOrderNumber} for planning item ${data.id}`,
        );
        return serializeWorkOrder(workOrder);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          attempts++;
          if (attempts >= 5) {
            throw new BadRequestException(
              'Kon geen uniek werkbonnummer genereren',
            );
          }
          continue;
        }
        throw error;
      }
    }
  }

  async findAll(user: User, query: ListWorkOrdersQueryDto) {
    const { search, status, planningItemId, inspectorId, page = 1, limit = 20 } = query;

    const where: Prisma.WorkOrderWhereInput = { ...orgScope(user) };

    if (status) {
      where.status = status;
    }

    if (planningItemId) {
      where.planningItemId = planningItemId;
    }

    if (inspectorId) {
      where.planningItem = {
        ...((where.planningItem as Prisma.PlanningItemWhereInput) || {}),
        inspectors: { some: { userId: inspectorId } },
      };
    }

    if (search) {
      where.OR = [
        {
          workOrderNumber: { contains: search, mode: 'insensitive' },
        },
        {
          planningItem: {
            contact: {
              companyName: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          planningItem: {
            productName: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    return paginate(this.prisma.workOrder, {
      where,
      include: WORK_ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const workOrder = assertFound(
      await this.prisma.workOrder.findUnique({
        where: { id },
        include: WORK_ORDER_INCLUDE,
      }),
      'Werkbon',
    );

    if (
      !user.roles.includes(Role.SUPERUSER) &&
      workOrder.orgId !== user.orgId
    ) {
      throw new ForbiddenException('Geen toegang tot deze werkbon');
    }

    return serializeWorkOrder(workOrder);
  }

  async create(dto: CreateWorkOrderDto, user: User) {
    let postalCode: string | null = null;
    let houseNumber: string | null = null;

    // If planning item is provided, verify it exists and belongs to org
    if (dto.planningItemId) {
      const planningItem = assertFound(
        await this.prisma.planningItem.findUnique({
          where: { id: dto.planningItemId },
          include: {
            location: { select: { postalCode: true, houseNumber: true } },
          },
        }),
        'Planregel',
      );

      if (
        !user.roles.includes(Role.SUPERUSER) &&
        planningItem.orgId !== user.orgId
      ) {
        throw new ForbiddenException('Geen toegang tot deze planregel');
      }

      if (planningItem.location) {
        postalCode = planningItem.location.postalCode;
        houseNumber = planningItem.location.houseNumber;
      }
    }

    let workOrderNumber: string;
    let attempts = 0;
    while (true) {
      workOrderNumber = this.generateWorkOrderNumber(postalCode, houseNumber);
      try {
        const workOrder = await this.prisma.workOrder.create({
          data: {
            orgId: user.orgId!,
            planningItemId: dto.planningItemId || undefined,
            workOrderNumber,
            internalNotes: dto.internalNotes,
            startTime: dto.startTime ? new Date(dto.startTime) : undefined,
            endTime: dto.endTime ? new Date(dto.endTime) : undefined,
            createdBy: user.id,
          },
          include: WORK_ORDER_INCLUDE,
        });
        return serializeWorkOrder(workOrder);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          attempts++;
          if (attempts >= 5) {
            throw new BadRequestException(
              'Kon geen uniek werkbonnummer genereren',
            );
          }
          continue;
        }
        throw error;
      }
    }
  }

  async update(id: string, dto: UpdateWorkOrderDto, user: User) {
    const workOrder = await this.findOne(id, user);

    // If linking to a planning item, verify it exists and belongs to org
    if (dto.planningItemId) {
      const planningItem = assertFound(
        await this.prisma.planningItem.findUnique({
          where: { id: dto.planningItemId },
        }),
        'Planregel',
      );
      if (!user.roles.includes(Role.SUPERUSER) && planningItem.orgId !== user.orgId) {
        throw new ForbiddenException('Geen toegang tot deze planregel');
      }
    }

    return serializeWorkOrder(await this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        planningItemId: dto.planningItemId !== undefined ? (dto.planningItemId || null) : undefined,
        internalNotes: dto.internalNotes,
        startTime:
          dto.startTime !== undefined
            ? dto.startTime
              ? new Date(dto.startTime)
              : null
            : undefined,
        endTime:
          dto.endTime !== undefined
            ? dto.endTime
              ? new Date(dto.endTime)
              : null
            : undefined,
      },
      include: WORK_ORDER_INCLUDE,
    }));
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto, user: User) {
    const workOrder = await this.findOne(id, user);

    if (workOrder.status === dto.status) {
      throw new BadRequestException(
        'Status is al ingesteld op de gewenste waarde',
      );
    }

    return serializeWorkOrder(await this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { status: dto.status },
      include: WORK_ORDER_INCLUDE,
    }));
  }

  async setLines(id: string, dto: SetWorkOrderLinesDto, user: User) {
    const workOrder = await this.findOne(id, user);

    return this.prisma.$transaction(async (tx) => {
      await tx.workOrderLine.deleteMany({
        where: { workOrderId: workOrder.id },
      });

      const lineData = dto.lines.map((line, index) => ({
        workOrderId: workOrder.id,
        productId: line.productId || undefined,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate ?? 21,
        lineTotal: Math.round(line.quantity * line.unitPrice * 100) / 100,
        sortOrder: line.sortOrder ?? index,
      }));

      if (lineData.length > 0) {
        await tx.workOrderLine.createMany({ data: lineData });
      }

      return serializeWorkOrder(await tx.workOrder.findUnique({
        where: { id: workOrder.id },
        include: WORK_ORDER_INCLUDE,
      }));
    });
  }

  async remove(id: string, user: User) {
    const workOrder = await this.findOne(id, user);

    await this.prisma.workOrder.delete({
      where: { id: workOrder.id },
    });
  }
}
