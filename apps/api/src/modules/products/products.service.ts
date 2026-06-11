import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertFound } from '@/common';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private customFieldsValidator: CustomFieldsValidator,
  ) {}

  async findAll(user: User, query: ListProductsQueryDto) {
    const { search, productGroupId, isActive, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['name', 'unit', 'defaultVat', 'isActive', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { name: 'asc' });

    // Org scoping — SUPERUSER sees all
    const where: Prisma.ProductWhereInput = { ...orgScope(user) };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productGroup: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (productGroupId) {
      where.productGroupId = productGroupId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return paginate(this.prisma.product, {
      where,
      include: {
        productGroup: { select: { id: true, name: true } },
      },
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const product = assertFound(
      await this.prisma.product.findUnique({
        where: { id },
        include: {
          productGroup: { select: { id: true, name: true } },
        },
      }),
      'Product',
    );

    if (!user.roles.includes(Role.SUPERUSER) && product.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return product;
  }

  async create(dto: CreateProductDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    const customFields = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(orgId!, 'PRODUCT', dto.customFields)
      : null;

    return this.prisma.product.create({
      data: {
        orgId: orgId!,
        name: dto.name,
        unit: dto.unit,
        description: dto.description,
        defaultVat: dto.defaultVat ?? 21,
        productGroupId: dto.productGroupId ?? null,
        isActive: dto.isActive ?? true,
        customFields: customFields as any,
      },
      include: {
        productGroup: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProductDto, user: User) {
    const product = await this.findOne(id, user);

    let customFieldsData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = {
        ...((product.customFields as Record<string, any>) ?? {}),
        ...dto.customFields,
      };
      customFieldsData = await this.customFieldsValidator.validateAndSanitize(
        product.orgId, 'PRODUCT', merged,
      );
    }

    return this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultVat !== undefined && { defaultVat: dto.defaultVat }),
        ...(dto.productGroupId !== undefined && { productGroupId: dto.productGroupId || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(customFieldsData !== undefined && { customFields: customFieldsData as any }),
      },
      include: {
        productGroup: { select: { id: true, name: true } },
      },
    });
  }
}
