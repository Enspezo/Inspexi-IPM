import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound, requireOrg } from '@/common';
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

    const where: Prisma.ProductGroupWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.productGroup, {
      where,
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    const group = await this.prisma.productGroup.findFirst({
      where: { id, ...orgScope(user) },
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

    return group;
  }

  async findAllCompact(user: User) {
    const where: Prisma.ProductGroupWhereInput = { ...orgScope(user), isDeleted: false };
    return this.prisma.productGroup.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateProductGroupDto, user: User) {
    // WP-B3 (B-503): effectieve org (SUPERUSER op org-subdomein → tenant-org);
    // zonder org een nette NL-400 i.p.v. een Prisma-fout (500).
    const orgId = requireOrg(user);

    return this.prisma.productGroup.create({
      data: {
        orgId,
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

    const product = assertFound(
      await this.prisma.product.findUnique({ where: { id: productId } }),
      'Product',
    );
    // FK-injectie (SEC-08-semantiek): de product-id is invoer van de caller —
    // bewust een 403 mét NL-melding, conform assertSameOrg.
    if (!user.roles.includes(Role.SUPERUSER) && product.orgId !== user.orgId) {
      throw new ForbiddenException('Product hoort niet bij uw organisatie');
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { productGroupId: group.id },
    });

    return this.findOne(groupId, user);
  }

  async removeProduct(groupId: string, productId: string, user: User) {
    const group = await this.findOne(groupId, user);

    // WP-C1 (B-105): org-scope in de query — een product van een andere org is
    // per definitie "niet in deze groep" en geeft dus dezelfde 404.
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...orgScope(user) },
    });
    if (!product || product.productGroupId !== group.id) {
      throw new NotFoundException('Product niet in deze groep gevonden');
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { productGroupId: null },
    });

    return this.findOne(groupId, user);
  }
}
