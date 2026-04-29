import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { CreateProductGroupDto, UpdateProductGroupDto, ListProductGroupsQueryDto } from './dto';

const PRODUCT_SELECT = {
  id: true,
  orgId: true,
  productGroupId: true,
  name: true,
  unit: true,
  defaultVat: true,
  description: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class ProductGroupsService {
  private readonly logger = new Logger(ProductGroupsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListProductGroupsQueryDto) {
    const { search, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductGroupWhereInput = {
      isDeleted: false,
    };

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.productGroup.findMany({
        where,
        include: {
          _count: { select: { products: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.productGroup.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const group = await this.prisma.productGroup.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          select: PRODUCT_SELECT,
          orderBy: { name: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });

    if (!group || group.isDeleted) {
      throw new NotFoundException('Productgroep niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && group.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return group;
  }

  async findAllCompact(user: User) {
    const where: Prisma.ProductGroupWhereInput = { isDeleted: false };
    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }
    return this.prisma.productGroup.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProductGroupDto, user: User) {
    if (!user.orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    return this.prisma.productGroup.create({
      data: {
        orgId: user.orgId!,
        name: dto.name,
        notes: dto.notes,
      },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProductGroupDto, user: User) {
    const group = await this.findOne(id, user);

    return this.prisma.productGroup.update({
      where: { id: group.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
      include: {
        products: {
          where: { isActive: true },
          select: PRODUCT_SELECT,
          orderBy: { name: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });
  }

  async softDelete(id: string, user: User) {
    const group = await this.findOne(id, user);

    const productCount = await this.prisma.product.count({
      where: { productGroupId: group.id, isActive: true },
    });

    if (productCount > 0) {
      throw new ConflictException(
        `Verwijderen niet mogelijk: ${productCount} actief product(en) gekoppeld aan deze groep`,
      );
    }

    await this.prisma.productGroup.update({
      where: { id: group.id },
      data: { isDeleted: true },
    });
  }

  // ─── Product koppeling ───────────────────────────────────

  async addProduct(groupId: string, productId: string, user: User) {
    const group = await this.findOne(groupId, user);

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product niet gevonden');
    }
    if (!user.roles.includes(Role.SUPERUSER) && product.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { productGroupId: group.id },
    });

    return this.findOne(groupId, user);
  }

  async removeProduct(groupId: string, productId: string, user: User) {
    const group = await this.findOne(groupId, user);

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.productGroupId !== group.id) {
      throw new NotFoundException('Product niet in deze groep gevonden');
    }
    if (!user.roles.includes(Role.SUPERUSER) && product.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { productGroupId: null },
    });

    return this.findOne(groupId, user);
  }
}
