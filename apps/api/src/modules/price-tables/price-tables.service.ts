import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound, assertAllSameOrg, requireOrg } from '@/common';
import {
  CreatePriceTableDto,
  UpdatePriceTableDto,
  SetPriceTableItemsDto,
  ListPriceTablesQueryDto,
} from './dto';

@Injectable()
export class PriceTablesService {
  private readonly logger = new Logger(PriceTablesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Convert Prisma.Decimal money fields (item.basePrice, tier.price) to plain numbers so the
   * portal receives numbers instead of Decimal-as-string. Safe on any price-table-shaped object.
   */
  private serializePriceTable<T extends Record<string, any> | null>(table: T): T {
    if (!table || !Array.isArray((table as any).items)) return table;
    return {
      ...(table as any),
      items: (table as any).items.map((item: any) => ({
        ...item,
        basePrice: item.basePrice != null ? Number(item.basePrice) : item.basePrice,
        tiers: Array.isArray(item.tiers)
          ? item.tiers.map((tier: any) => ({ ...tier, price: tier.price != null ? Number(tier.price) : tier.price }))
          : item.tiers,
      })),
    };
  }

  async findAll(user: User, query: ListPriceTablesQueryDto) {
    const { search, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['name', 'isDefault', 'createdAt'];
    const orderBy: object = (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy))
      ? { [sortBy]: sortOrder }
      : [{ isDefault: 'desc' }, { name: 'asc' }];

    const where: Prisma.PriceTableWhereInput = { ...orgScope(user) };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.priceTable, {
      where,
      include: {
        _count: { select: { items: true } },
      },
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const priceTable = assertFound(await this.prisma.priceTable.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            tiers: { orderBy: { fromQty: 'asc' } },
          },
          orderBy: { product: { name: 'asc' } },
        },
        contactPriceTables: {
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
          },
        },
      },
    }), 'Prijstabel');

    if (!user.roles.includes(Role.SUPERUSER) && priceTable.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return this.serializePriceTable(priceTable);
  }

  async create(dto: CreatePriceTableDto, user: User) {
    // WP-B3 (B-503): effectieve org (SUPERUSER op org-subdomein → tenant-org);
    // zonder org een nette NL-400 i.p.v. een Prisma-fout (500).
    const orgId = requireOrg(user);

    // If setting as default, unset other defaults in a transaction
    if (dto.isDefault) {
      return this.prisma.$transaction(async (tx) => {
        await tx.priceTable.updateMany({
          where: { orgId, isDefault: true },
          data: { isDefault: false },
        });

        return tx.priceTable.create({
          data: {
            orgId,
            name: dto.name,
            description: dto.description,
            isDefault: true,
          },
        });
      });
    }

    return this.prisma.priceTable.create({
      data: {
        orgId,
        name: dto.name,
        description: dto.description,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async update(id: string, dto: UpdatePriceTableDto, user: User) {
    const priceTable = await this.findOne(id, user);

    // If setting as default, unset other defaults in a transaction
    if (dto.isDefault) {
      return this.prisma.$transaction(async (tx) => {
        await tx.priceTable.updateMany({
          where: { orgId: priceTable.orgId, isDefault: true },
          data: { isDefault: false },
        });

        return tx.priceTable.update({
          where: { id: priceTable.id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            isDefault: true,
          },
        });
      });
    }

    return this.prisma.priceTable.update({
      where: { id: priceTable.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async setItems(id: string, dto: SetPriceTableItemsDto, user: User) {
    const priceTable = await this.findOne(id, user);

    // Verify every referenced product belongs to the caller's org before writing
    // — otherwise a tenant could attach another org's product ids and read that
    // org's product name/unit back through the `product` include.
    await assertAllSameOrg(
      this.prisma.product,
      dto.items.map((i) => i.productId).filter((pid): pid is string => !!pid),
      user.orgId,
      'producten',
    );

    // Replace all items + tiers in a single transaction
    return this.prisma.$transaction(async (tx) => {
      // Delete existing tiers first (child), then items (parent)
      await tx.priceTier.deleteMany({
        where: { priceTableItem: { priceTableId: priceTable.id } },
      });
      await tx.priceTableItem.deleteMany({
        where: { priceTableId: priceTable.id },
      });

      // Create new items with their tiers
      for (const item of dto.items) {
        await tx.priceTableItem.create({
          data: {
            priceTableId: priceTable.id,
            productId: item.productId,
            priceType: item.priceType,
            basePrice: item.basePrice,
            tiers: item.tiers
              ? {
                  create: item.tiers.map((tier) => ({
                    fromQty: tier.fromQty,
                    toQty: tier.toQty,
                    price: tier.price,
                  })),
                }
              : undefined,
          },
        });
      }

      // Return the full updated price table
      const updated = await tx.priceTable.findUnique({
        where: { id: priceTable.id },
        include: {
          items: {
            include: {
              product: true,
              tiers: { orderBy: { fromQty: 'asc' } },
            },
            orderBy: { product: { name: 'asc' } },
          },
        },
      });
      return this.serializePriceTable(updated);
    });
  }

  async assignToContact(id: string, contactId: string, user: User) {
    const priceTable = await this.findOne(id, user);

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

    // Check if already assigned
    const existing = await this.prisma.contactPriceTable.findUnique({
      where: {
        contactId_priceTableId: {
          contactId,
          priceTableId: priceTable.id,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Prijstabel is al gekoppeld aan deze relatie');
    }

    return this.prisma.contactPriceTable.create({
      data: {
        contactId,
        priceTableId: priceTable.id,
      },
      include: {
        contact: {
          select: {
            id: true,
            type: true,
            companyName: true,
            firstName: true,
            lastName: true,
          },
        },
        priceTable: true,
      },
    });
  }

  async removeFromContact(id: string, contactId: string, user: User) {
    const priceTable = await this.findOne(id, user);

    assertFound(
      await this.prisma.contactPriceTable.findUnique({
        where: {
          contactId_priceTableId: {
            contactId,
            priceTableId: priceTable.id,
          },
        },
      }),
      'Koppeling',
    );

    await this.prisma.contactPriceTable.delete({
      where: {
        contactId_priceTableId: {
          contactId,
          priceTableId: priceTable.id,
        },
      },
    });
  }

  async findForContact(contactId: string, user: User) {
    // Verify contact access
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    // Get assigned price tables
    const assignments = await this.prisma.contactPriceTable.findMany({
      where: { contactId },
      include: {
        priceTable: {
          include: {
            items: {
              include: {
                product: true,
                tiers: { orderBy: { fromQty: 'asc' } },
              },
              orderBy: { product: { name: 'asc' } },
            },
          },
        },
      },
    });

    // If no specific tables assigned, return the org default
    if (assignments.length === 0) {
      const defaultTable = await this.prisma.priceTable.findFirst({
        where: { orgId: contact.orgId, isDefault: true },
        include: {
          items: {
            include: {
              product: true,
              tiers: { orderBy: { fromQty: 'asc' } },
            },
            orderBy: { product: { name: 'asc' } },
          },
        },
      });

      return defaultTable ? [this.serializePriceTable(defaultTable)] : [];
    }

    return assignments.map((a) => this.serializePriceTable(a.priceTable));
  }
}
