import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertFound, assertSameOrg, requireOrg } from '@/common';
import { NumberingService } from '@/modules/numbering/numbering.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private customFieldsValidator: CustomFieldsValidator,
    private numbering: NumberingService,
  ) {}

  async findAll(user: User, query: ListProductsQueryDto) {
    const { search, productGroupId, isActive, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['productCode', 'name', 'unit', 'defaultVat', 'isActive', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { name: 'asc' });

    // Org scoping — SUPERUSER sees all
    const where: Prisma.ProductWhereInput = { ...orgScope(user) };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productCode: { contains: search, mode: 'insensitive' } },
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
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    return assertFound(
      await this.prisma.product.findFirst({
        where: { id, ...orgScope(user) },
        include: {
          productGroup: { select: { id: true, name: true } },
        },
      }),
      'Product',
    );
  }

  async create(dto: CreateProductDto, user: User) {
    // WP-B3 (B-503): effectieve org (SUPERUSER op org-subdomein → tenant-org);
    // zonder org een nette NL-400 i.p.v. een Prisma-fout (500).
    const orgId = requireOrg(user);

    const customFields = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(orgId, 'PRODUCT', dto.customFields)
      : null;

    // The product group is read back through the include — verify it belongs to
    // the caller's org (a foreign group's name would otherwise leak).
    await assertSameOrg(this.prisma.productGroup, dto.productGroupId, orgId, 'Productgroep');

    return this.numbering.runWithGeneratedNumber(
      'PRODUCT',
      orgId,
      {
        manual: dto.productCode,
        loadContext: async () => ({
          groep: dto.productGroupId
            ? (
                await this.prisma.productGroup.findUnique({
                  where: { id: dto.productGroupId },
                  select: { name: true },
                })
              )?.name
            : undefined,
        }),
      },
      (tx, productCode) =>
        tx.product.create({
          data: {
            orgId,
            productCode,
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
        }),
    );
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

    // Manual renumber — gated on the scheme's allowManualEntry + uniqueness check.
    let manualCode: string | undefined;
    if (dto.productCode !== undefined && dto.productCode.trim() !== (product.productCode ?? '')) {
      manualCode = await this.numbering.validateManualNumber(
        product.orgId, 'PRODUCT', dto.productCode, product.id,
      );
    }

    // Validate a re-pointed product group against the caller's org (read back via include).
    if (dto.productGroupId !== undefined)
      await assertSameOrg(this.prisma.productGroup, dto.productGroupId, user.orgId, 'Productgroep');

    return this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(manualCode !== undefined && { productCode: manualCode }),
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
