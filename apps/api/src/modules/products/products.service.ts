import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListProductsQueryDto) {
    const { search, category, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    // Org scoping — SUPERUSER sees all
    if (user.role !== Role.SUPERUSER) {
      where.orgId = user.orgId!;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product niet gevonden');
    }

    if (user.role !== Role.SUPERUSER && product.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return product;
  }

  async create(dto: CreateProductDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && user.role !== Role.SUPERUSER) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    return this.prisma.product.create({
      data: {
        orgId: orgId!,
        name: dto.name,
        unit: dto.unit,
        description: dto.description,
        defaultVat: dto.defaultVat ?? 21,
        category: dto.category,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateProductDto, user: User) {
    const product = await this.findOne(id, user);

    return this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultVat !== undefined && { defaultVat: dto.defaultVat }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
