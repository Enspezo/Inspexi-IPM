import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto';

@Injectable()
export class ChecklistItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alle (zichtbare) checklist-items: eigen org + systeem. Niet gefilterd op normtype
   * (items zijn generiek en herbruikbaar in elke checklist).
   */
  async findAll(
    user: User,
    options?: { categoryId?: string; search?: string; includeSystem?: boolean },
  ) {
    const orgId = user.orgId;
    const { categoryId, search, includeSystem = true } = options || {};

    const andConditions: Prisma.ChecklistItemWhereInput[] = [{ isActive: true }];

    if (orgId) {
      andConditions.push({
        OR: [
          { orgId },
          ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
        ],
      });
    }

    if (categoryId) andConditions.push({ categoryId });

    if (search) {
      andConditions.push({
        OR: [
          { question: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { instruction: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return this.prisma.checklistItem.findMany({
      where: { AND: andConditions },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: [
        { isSystem: 'desc' },
        { category: { name: 'asc' } },
        { code: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const item = await this.prisma.checklistItem.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException('Checklist-item niet gevonden');
    }

    if (orgId !== null) {
      const canAccess =
        item.orgId === orgId || (item.orgId === null && item.isSystem);
      if (!canAccess) throw new NotFoundException('Checklist-item niet gevonden');
    }

    return item;
  }

  async create(user: User, dto: CreateChecklistItemDto) {
    const orgId = user.orgId;

    // Alleen superuser mag systeem-items aanmaken
    if (dto.isSystem && orgId !== null) {
      throw new ForbiddenException(
        'Alleen een superuser kan systeem-items aanmaken',
      );
    }
    const isSystem = dto.isSystem ?? orgId === null;

    if (dto.categoryId) await this.assertCategoryAccessible(dto.categoryId, user);

    // Duplicaat-code binnen scope
    if (dto.code) {
      const existing = await this.prisma.checklistItem.findFirst({
        where: {
          code: dto.code,
          orgId: isSystem ? null : orgId,
          isActive: true,
        },
      });
      if (existing) {
        throw new BadRequestException(
          `Checklist-item met code '${dto.code}' bestaat al`,
        );
      }
    }

    return this.prisma.checklistItem.create({
      data: {
        code: dto.code,
        question: dto.question,
        instruction: dto.instruction,
        normReference: dto.normReference,
        categoryId: dto.categoryId,
        isSystem,
        orgId: isSystem ? null : orgId,
        createdBy: user.id,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });
  }

  async update(id: string, user: User, dto: UpdateChecklistItemDto) {
    const item = await this.findById(id, user);
    this.assertManageable(item, user);

    if (dto.categoryId) await this.assertCategoryAccessible(dto.categoryId, user);

    // Duplicaat-code bij wijziging
    if (dto.code && dto.code !== item.code) {
      const existing = await this.prisma.checklistItem.findFirst({
        where: {
          code: dto.code,
          orgId: item.orgId,
          isActive: true,
          NOT: { id },
        },
      });
      if (existing) {
        throw new BadRequestException(
          `Checklist-item met code '${dto.code}' bestaat al`,
        );
      }
    }

    return this.prisma.checklistItem.update({
      where: { id },
      data: {
        code: dto.code,
        question: dto.question,
        instruction: dto.instruction,
        normReference: dto.normReference,
        categoryId: dto.categoryId,
        isActive: dto.isActive,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });
  }

  /** Soft-delete (item blijft gekoppeld in bestaande checklists). */
  async delete(id: string, user: User) {
    const item = await this.findById(id, user);
    this.assertManageable(item, user);

    return this.prisma.checklistItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Categorieën die door checklist-items gebruikt worden (org + systeem). */
  async getUsedCategories(user: User) {
    const orgId = user.orgId;
    const andConditions: Prisma.ChecklistItemWhereInput[] = [
      { isActive: true },
      { categoryId: { not: null } },
    ];

    if (orgId !== null) {
      andConditions.push({
        OR: [{ orgId }, { orgId: null, isSystem: true }],
      });
    }

    const items = await this.prisma.checklistItem.findMany({
      where: { AND: andConditions },
      select: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      distinct: ['categoryId'],
    });

    return items
      .map((i) => i.category)
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Helpers ───────────────────────────────────────────

  /** Categorie moet bestaan en zichtbaar zijn (systeem of eigen org). */
  private async assertCategoryAccessible(
    categoryId: string,
    user: User,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('Categorie niet gevonden');

    // Org-OR-systeem: systeemrijen of de eigen org. Superuser mag alles.
    if (user.orgId !== null) {
      const accessible =
        category.orgId === null || category.orgId === user.orgId;
      if (!accessible) {
        throw new ForbiddenException('Deze categorie hoort niet bij uw organisatie');
      }
    }
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    item: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    if (item.isSystem) {
      if (user.orgId !== null) {
        throw new ForbiddenException('Systeem-items zijn alleen-lezen');
      }
    } else if (item.orgId !== user.orgId) {
      throw new ForbiddenException('Dit item hoort niet bij uw organisatie');
    }
  }
}
