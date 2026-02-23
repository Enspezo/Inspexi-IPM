import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  NotImplementedException,
} from '@nestjs/common';
import { User, Role, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateRequestDto,
  UpdateRequestDto,
  UpdateRequestStatusDto,
  ListRequestsQueryDto,
} from './dto';

@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListRequestsQueryDto) {
    const { search, status, priority, assignedTo, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RequestWhereInput = {
      isDeleted: false,
    };

    if (user.role !== Role.SUPERUSER) {
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

    if (user.role !== Role.SUPERUSER && request.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return request;
  }

  async create(dto: CreateRequestDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && user.role !== Role.SUPERUSER) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    // Verify contact belongs to same org
    const contact = await this.prisma.contact.findUnique({
      where: { id: dto.contactId },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    if (user.role !== Role.SUPERUSER && contact.orgId !== orgId) {
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

    // Verify location if provided
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new NotFoundException('Locatie niet gevonden');
      }
      if (location.contactId !== request.contactId) {
        throw new ForbiddenException('Locatie behoort niet tot deze relatie');
      }
    }

    return this.prisma.request.update({
      where: { id: request.id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.assignedTo !== undefined && { assignedTo: dto.assignedTo }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });
  }

  async updateStatus(id: string, dto: UpdateRequestStatusDto, user: User) {
    const request = await this.findOne(id, user);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id: request.id },
        data: { status: dto.status },
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

      return updated;
    });
  }

  async softDelete(id: string, user: User) {
    const request = await this.findOne(id, user);

    return this.prisma.request.update({
      where: { id: request.id },
      data: { isDeleted: true },
    });
  }

  async createQuote(_id: string, _user: User) {
    throw new NotImplementedException(
      'Offertes (PRD-05) nog niet geïmplementeerd',
    );
  }
}
