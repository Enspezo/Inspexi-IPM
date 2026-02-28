import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma, RequestStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateRequestDto,
  UpdateRequestDto,
  UpdateRequestStatusDto,
  ListRequestsQueryDto,
} from './dto';
import { QuotesService } from '../quotes/quotes.service';

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private quotesService: QuotesService,
    private notifications: NotificationsService,
  ) {}

  async findAll(user: User, query: ListRequestsQueryDto) {
    const { search, status, priority, assignedTo, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RequestWhereInput = {
      isDeleted: false,
    };

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (assignedTo) {
      where.assignedTo = assignedTo;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        {
          contact: {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              type: true,
              companyName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.request.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            type: true,
            companyName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            city: true,
            street: true,
            houseNumber: true,
            postalCode: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        statusHistory: {
          include: {
            changedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!request || request.isDeleted) {
      throw new NotFoundException('Aanvraag niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && request.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return request;
  }

  async create(dto: CreateRequestDto, user: User) {
    let orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    // Verify contact belongs to same org
    const contact = await this.prisma.contact.findUnique({
      where: { id: dto.contactId },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    // For SUPERUSER (no orgId), derive orgId from the contact
    if (!orgId && user.roles.includes(Role.SUPERUSER)) {
      orgId = contact.orgId;
    }

    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== orgId) {
      throw new ForbiddenException('Relatie behoort niet tot uw organisatie');
    }

    // Verify location if provided
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new NotFoundException('Locatie niet gevonden');
      }
      if (location.contactId !== dto.contactId) {
        throw new ForbiddenException('Locatie behoort niet tot deze relatie');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          orgId: orgId!,
          contactId: dto.contactId,
          locationId: dto.locationId,
          assignedTo: dto.assignedTo,
          source: dto.source,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 'NORMAL',
          createdBy: user.id,
        },
      });

      // Create initial status history entry
      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: RequestStatus.NIEUW,
          changedBy: user.id,
        },
      });

      return request;
    });
  }

  async update(id: string, dto: UpdateRequestDto, user: User) {
    const request = await this.findOne(id, user);
    const oldAssignedTo = request.assignedTo;

    // Determine the effective contactId (may change)
    const effectiveContactId = dto.contactId ?? request.contactId;

    // Verify new contact if provided
    if (dto.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
      });
      if (!contact || contact.isDeleted) {
        throw new NotFoundException('Relatie niet gevonden');
      }
      if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== user.orgId) {
        throw new ForbiddenException();
      }
    }

    // Verify location if provided — must belong to the (possibly new) contact
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new NotFoundException('Locatie niet gevonden');
      }
      if (location.contactId !== effectiveContactId) {
        throw new ForbiddenException('Locatie behoort niet tot deze relatie');
      }
    }

    // If contact changes and no new location is provided, clear the location
    const shouldClearLocation =
      dto.contactId && dto.contactId !== request.contactId && dto.locationId === undefined;

    const updated = await this.prisma.request.update({
      where: { id: request.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.contactId !== undefined && { contactId: dto.contactId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(shouldClearLocation && { locationId: null }),
        ...(dto.assignedTo !== undefined && { assignedTo: dto.assignedTo }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });

    // Notify new assignee when assignment changes
    if (dto.assignedTo && dto.assignedTo !== oldAssignedTo) {
      this.notifications.dispatch({
        type: NotificationType.AANVRAAG_TOEGEWEZEN,
        orgId: request.orgId,
        recipientUserIds: [dto.assignedTo],
        title: 'Aanvraag toegewezen',
        body: `Aanvraag "${request.title}" is aan u toegewezen.`,
        entityType: 'request',
        entityId: request.id,
      });
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateRequestStatusDto, user: User) {
    const request = await this.findOne(id, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      const lostFields =
        dto.status === 'VERLOREN'
          ? { lostReason: dto.lostReason ?? null, lostNote: dto.lostNote ?? null }
          : { lostReason: null, lostNote: null };

      const result = await tx.request.update({
        where: { id: request.id },
        data: { status: dto.status, ...lostFields },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: request.status,
          toStatus: dto.status,
          changedBy: user.id,
          note: dto.note,
        },
      });

      return result;
    });

    // Notify the assigned user about status change
    if (request.assignedTo) {
      this.notifications.dispatch({
        type: NotificationType.AANVRAAG_STATUS_GEWIJZIGD,
        orgId: request.orgId,
        recipientUserIds: [request.assignedTo],
        title: 'Aanvraagstatus gewijzigd',
        body: `Status van aanvraag "${request.title}" is gewijzigd naar ${dto.status}.`,
        entityType: 'request',
        entityId: request.id,
      });
    }

    return updated;
  }

  async softDelete(id: string, user: User) {
    const request = await this.findOne(id, user);

    return this.prisma.request.update({
      where: { id: request.id },
      data: { isDeleted: true },
    });
  }

  async createQuote(id: string, user: User) {
    // Verify request exists and user has access
    await this.findOne(id, user);
    return this.quotesService.createFromRequest(id, user);
  }
}
