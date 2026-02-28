import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateCustomerGroupDto,
  UpdateCustomerGroupDto,
  ListCustomerGroupsQueryDto,
} from './dto';

@Injectable()
export class CustomerGroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListCustomerGroupsQueryDto) {
    const { search, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerGroupWhereInput = {
      isDeleted: false,
    };

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.customerGroup.findMany({
        where,
        include: {
          _count: { select: { contacts: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.customerGroup.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const group = await this.prisma.customerGroup.findUnique({
      where: { id },
      include: {
        contacts: {
          include: {
            contact: {
              select: {
                id: true,
                type: true,
                companyName: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                isDeleted: true,
              },
            },
          },
        },
        _count: { select: { contacts: true } },
      },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Klantgroep niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && group.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return group;
  }

  async create(dto: CreateCustomerGroupDto, user: User) {
    return this.prisma.customerGroup.create({
      data: {
        orgId: user.orgId!,
        name: dto.name,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerGroupDto, user: User) {
    const group = await this.findOne(id, user);

    return this.prisma.customerGroup.update({
      where: { id: group.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async softDelete(id: string, user: User) {
    const group = await this.findOne(id, user);

    await this.prisma.customerGroup.update({
      where: { id: group.id },
      data: { isDeleted: true },
    });
  }

  // ─── Contact toewijzing ──────────────────────────────

  async addContact(groupId: string, contactId: string, user: User) {
    const group = await this.findOne(groupId, user);

    // Verify contact exists and belongs to same org
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }
    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    // Upsert to avoid duplicate errors
    await this.prisma.contactCustomerGroup.upsert({
      where: {
        contactId_customerGroupId: {
          contactId,
          customerGroupId: group.id,
        },
      },
      create: {
        contactId,
        customerGroupId: group.id,
      },
      update: {},
    });

    return this.findOne(groupId, user);
  }

  async removeContact(groupId: string, contactId: string, user: User) {
    const group = await this.findOne(groupId, user);

    await this.prisma.contactCustomerGroup.deleteMany({
      where: {
        contactId,
        customerGroupId: group.id,
      },
    });

    return this.findOne(groupId, user);
  }

  // ─── Alle groepen (compact) voor dropdowns ────────────

  async findAllCompact(user: User) {
    const where: Prisma.CustomerGroupWhereInput = {
      isDeleted: false,
    };
    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    return this.prisma.customerGroup.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
