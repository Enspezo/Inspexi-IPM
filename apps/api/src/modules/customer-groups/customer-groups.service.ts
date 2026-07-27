import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope } from '@/common';
import {
  CreateCustomerGroupDto,
  UpdateCustomerGroupDto,
  ListCustomerGroupsQueryDto,
} from './dto';

@Injectable()
export class CustomerGroupsService {
  private readonly logger = new Logger(CustomerGroupsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListCustomerGroupsQueryDto) {
    const { search, page = 1, limit = 50 } = query;

    const where: Prisma.CustomerGroupWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.customerGroup, {
      where,
      include: {
        _count: { select: { contacts: true } },
      },
      orderBy: { name: 'asc' },
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    const group = await this.prisma.customerGroup.findFirst({
      where: { id, ...orgScope(user) },
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
    // FK-injectie (SEC-08-semantiek): de contact-id is invoer van de caller —
    // bewust een 403 mét NL-melding, conform assertSameOrg.
    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== user.orgId) {
      throw new ForbiddenException('Relatie hoort niet bij uw organisatie');
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
      ...orgScope(user),
      isDeleted: false,
    };

    return this.prisma.customerGroup.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
