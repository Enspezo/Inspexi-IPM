import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Category, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertSystemRowManageable } from '@/common';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
} from './dto';

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alle (zichtbare) categorieën: eigen org + systeem. Superuser (orgId null) ziet alles. */
  async findAll(
    user: User,
    options?: {
      includeSystem?: boolean;
      parentId?: string;
      flat?: boolean;
      includeInactive?: boolean;
    },
  ) {
    const orgId = user.orgId;
    const {
      includeSystem = true,
      parentId,
      flat = false,
      includeInactive = false,
    } = options || {};

    const and: Prisma.CategoryWhereInput[] = [];

    if (orgId) {
      and.push({
        OR: [{ orgId }, ...(includeSystem ? [{ orgId: null, isSystem: true }] : [])],
      });
    }
    if (parentId !== undefined) {
      and.push({ parentId });
    }
    if (!includeInactive) {
      and.push({ isActive: true });
    }

    return this.prisma.category.findMany({
      where: and.length > 0 ? { AND: and } : {},
      include: { _count: { select: { children: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Categorieën als boomstructuur (org + systeem). */
  async getTree(
    user: User,
    options?: { includeSystem?: boolean; includeInactive?: boolean },
  ): Promise<CategoryTreeNode[]> {
    const orgId = user.orgId;
    const { includeSystem = true, includeInactive = false } = options || {};

    const and: Prisma.CategoryWhereInput[] = [];
    if (orgId) {
      and.push({
        OR: [{ orgId }, ...(includeSystem ? [{ orgId: null, isSystem: true }] : [])],
      });
    }
    if (!includeInactive) {
      and.push({ isActive: true });
    }

    const categories = await this.prisma.category.findMany({
      where: and.length > 0 ? { AND: and } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return this.buildHierarchy(categories);
  }

  async findById(id: string, user: User) {
    const category = await this.prisma.category.findFirst({
      where: { id, ...this.visibleScope(user) },
      include: {
        parent: { select: { id: true, name: true } },
        children: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!category) throw new NotFoundException('Categorie niet gevonden');
    return category;
  }

  async create(user: User, dto: CreateCategoryDto) {
    const orgId = user.orgId;
    const isSuperuser = orgId === null;

    // Alleen superuser mag systeemcategorieën aanmaken
    if (dto.isSystem && !isSuperuser) {
      throw new ForbiddenException('Alleen SUPERUSER kan systeemcategorieën aanmaken');
    }

    // Een superuser maakt altijd een systeemcategorie aan
    const isSystem = isSuperuser ? true : dto.isSystem ?? false;

    // Ouder valideren: moet zichtbaar zijn voor deze gebruiker
    if (dto.parentId) {
      const parent = await this.findVisibleOrThrow(dto.parentId, user, true);
      // Systeemcategorieën mogen alleen systeem-ouders hebben
      if (isSystem && !parent.isSystem) {
        throw new BadRequestException(
          'Systeemcategorieën mogen alleen een systeem-ouder hebben',
        );
      }
    }

    // Volgende sorteervolgorde binnen dezelfde scope/ouder
    const maxOrder = await this.prisma.category.aggregate({
      where: { orgId: isSystem ? null : orgId, parentId: dto.parentId ?? null },
      _max: { sortOrder: true },
    });

    return this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        parentId: dto.parentId ?? null,
        isSystem,
        orgId: isSystem ? null : orgId,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        createdBy: user.id,
      },
      include: { parent: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, user: User, dto: UpdateCategoryDto) {
    const category = await this.findById(id, user);
    this.assertManageable(category, user);

    // Nieuwe ouder valideren + cycli voorkomen
    if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
      if (dto.parentId) {
        if (dto.parentId === id) {
          throw new BadRequestException('Een categorie kan niet haar eigen ouder zijn');
        }
        await this.findVisibleOrThrow(dto.parentId, user, true);
        if (await this.isDescendantOf(dto.parentId, id)) {
          throw new BadRequestException(
            'Een categorie kan niet onder haar eigen kind geplaatst worden',
          );
        }
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        parent: { select: { id: true, name: true } },
        children: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
  }

  async delete(id: string, user: User) {
    const category = await this.findById(id, user);
    this.assertManageable(category, user);

    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException(
        'Verwijder eerst de subcategorieën of verplaats ze',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(user: User, dto: ReorderCategoriesDto) {
    // Elke genoemde categorie moet zichtbaar én beheerbaar zijn
    for (const item of dto.items) {
      const category = await this.findVisibleOrThrow(item.id, user, false);
      this.assertManageable(category, user);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { reordered: true };
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Where-fragment dat alleen zichtbare rijen toelaat (org + systeem; superuser → alles). */
  private visibleScope(user: User): Prisma.CategoryWhereInput {
    return user.orgId
      ? { OR: [{ orgId: user.orgId }, { orgId: null, isSystem: true }] }
      : {};
  }

  /** Haal een categorie op die zichtbaar is voor de gebruiker, anders NotFound/BadRequest. */
  private async findVisibleOrThrow(
    id: string,
    user: User,
    asParent: boolean,
  ): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, ...this.visibleScope(user) },
    });
    if (!category) {
      throw asParent
        ? new BadRequestException('Ouder-categorie niet gevonden')
        : new NotFoundException('Categorie niet gevonden');
    }
    return category;
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    cat: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    assertSystemRowManageable(cat, user, {
      system: 'Systeemcategorieën zijn alleen-lezen',
      org: 'Deze categorie hoort niet bij uw organisatie',
    });
  }

  /** Loopt de ouder-keten af om cycli bij verplaatsen te detecteren. */
  private async isDescendantOf(categoryId: string, ancestorId: string): Promise<boolean> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { parentId: true },
    });
    if (!category?.parentId) return false;
    if (category.parentId === ancestorId) return true;
    return this.isDescendantOf(category.parentId, ancestorId);
  }

  private buildHierarchy(
    categories: Category[],
    parentId: string | null = null,
  ): CategoryTreeNode[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ ...c, children: this.buildHierarchy(categories, c.id) }));
  }
}
