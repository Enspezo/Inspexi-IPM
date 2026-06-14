import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, ChecklistStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateChecklistDto,
  UpdateChecklistDto,
  AddItemToChecklistDto,
  UpdateItemLinkDto,
  PublishChecklistDto,
  RetireChecklistDto,
  NewVersionDto,
  ImportChecklistDto,
} from './dto';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alle (zichtbare) checklists: eigen org + systeem. Superuser (orgId null) ziet alles.
   */
  async findAll(
    user: User,
    options?: {
      normType?: string;
      assetType?: string;
      locationType?: string;
      status?: ChecklistStatus;
      includeSystem?: boolean;
    },
  ) {
    const orgId = user.orgId;
    const {
      normType,
      assetType,
      locationType,
      status,
      includeSystem = true,
    } = options || {};

    const andConditions: Prisma.ChecklistWhereInput[] = [];

    if (orgId) {
      // Org-gebruiker ziet de eigen checklists + optioneel systeem-checklists
      andConditions.push({
        OR: [
          { orgId },
          ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
        ],
      });
    }
    // Superuser (orgId === null) ziet alles — geen extra filter

    if (normType) andConditions.push({ normTypeCode: normType });
    if (status) andConditions.push({ status });
    if (assetType) andConditions.push({ assetTypes: { has: assetType } });
    if (locationType) andConditions.push({ locationTypes: { has: locationType } });

    return this.prisma.checklist.findMany({
      where: andConditions.length > 0 ? { AND: andConditions } : {},
      include: {
        _count: { select: { itemLinks: true } },
      },
      orderBy: [
        { isSystem: 'desc' },
        { status: 'asc' },
        { name: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  /**
   * Eén checklist met items + versie-relaties (org-scoped).
   */
  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const checklist = await this.prisma.checklist.findUnique({
      where: { id },
      include: {
        itemLinks: {
          include: { checklistItem: { include: { category: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        previousVersion: { select: { id: true, version: true, status: true } },
        nextVersions: { select: { id: true, version: true, status: true } },
      },
    });

    if (!checklist) throw new NotFoundException('Checklist niet gevonden');

    if (orgId !== null) {
      const canAccess =
        checklist.orgId === orgId ||
        (checklist.orgId === null && checklist.isSystem);
      if (!canAccess) throw new NotFoundException('Checklist niet gevonden');
    }

    return checklist;
  }

  /**
   * Actieve checklist voor een asset/locatie + norm (gebruikt door de PWA).
   * Eerst org-specifiek, dan systeem als fallback.
   */
  async getActiveChecklistForAsset(
    normTypeCode: string,
    assetType: string,
    locationType: string | null,
    orgId: string,
  ) {
    const include = {
      itemLinks: {
        include: { checklistItem: { include: { category: true } } },
        orderBy: { sortOrder: 'asc' as const },
      },
    };

    let checklist = await this.prisma.checklist.findFirst({
      where: {
        orgId,
        normTypeCode,
        status: ChecklistStatus.ACTIEF,
        assetTypes: { has: assetType },
        ...(locationType ? { locationTypes: { has: locationType } } : {}),
      },
      include,
      orderBy: { version: 'desc' },
    });

    if (!checklist) {
      checklist = await this.prisma.checklist.findFirst({
        where: {
          orgId: null,
          isSystem: true,
          normTypeCode,
          status: ChecklistStatus.ACTIEF,
          assetTypes: { has: assetType },
          ...(locationType ? { locationTypes: { has: locationType } } : {}),
        },
        include,
        orderBy: { version: 'desc' },
      });
    }

    return checklist;
  }

  async create(user: User, dto: CreateChecklistDto) {
    const orgId = user.orgId;

    // Alleen superuser mag systeem-checklists aanmaken
    if (dto.isSystem && orgId !== null) {
      throw new ForbiddenException(
        'Alleen een superuser kan systeem-checklists aanmaken',
      );
    }
    const isSystem = dto.isSystem ?? orgId === null;

    await this.assertNormTypeExists(dto.normTypeCode);

    // Duplicaat-code binnen scope (versie 1.0)
    if (dto.code) {
      const existing = await this.prisma.checklist.findFirst({
        where: {
          code: dto.code,
          orgId: isSystem ? null : orgId,
          version: '1.0',
        },
      });
      if (existing) {
        throw new BadRequestException(
          `Checklist met code '${dto.code}' bestaat al`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const newChecklist = await tx.checklist.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          normTypeCode: dto.normTypeCode,
          assetTypes: dto.assetTypes,
          locationTypes: dto.locationTypes ?? [],
          isSystem,
          orgId: isSystem ? null : orgId,
          createdBy: user.id,
          status: ChecklistStatus.CONCEPT,
          version: '1.0',
        },
      });

      await tx.checklistVersionHistory.create({
        data: {
          checklistId: newChecklist.id,
          fromVersion: '1.0',
          toVersion: '1.0',
          fromStatus: ChecklistStatus.CONCEPT,
          toStatus: ChecklistStatus.CONCEPT,
          changeDescription: 'Checklist aangemaakt',
          changedBy: user.id,
          snapshot: {
            name: dto.name,
            code: dto.code || null,
            description: dto.description || null,
            normTypeCode: dto.normTypeCode,
            assetTypes: dto.assetTypes,
            locationTypes: dto.locationTypes ?? [],
            items: [],
          },
        },
      });

      return newChecklist;
    });
  }

  /** Bijwerken — alleen status CONCEPT. */
  async update(id: string, user: User, dto: UpdateChecklistDto) {
    const checklist = await this.findById(id, user);
    this.assertManageable(checklist, user);
    this.assertConcept(checklist);

    if (dto.normTypeCode) await this.assertNormTypeExists(dto.normTypeCode);

    return this.prisma.checklist.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        normTypeCode: dto.normTypeCode,
        assetTypes: dto.assetTypes,
        locationTypes: dto.locationTypes,
        updatedBy: user.id,
      },
    });
  }

  /** Verwijderen — alleen status CONCEPT (cascade verwijdert item-links). */
  async delete(id: string, user: User) {
    const checklist = await this.findById(id, user);
    this.assertManageable(checklist, user);
    this.assertConcept(checklist);

    await this.prisma.checklist.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Item-koppelingen ──────────────────────────────────

  async addItem(checklistId: string, user: User, dto: AddItemToChecklistDto) {
    const checklist = await this.findById(checklistId, user);
    this.assertManageable(checklist, user);
    this.assertConcept(checklist);

    const orgId = user.orgId;
    // Item moet bestaan en zichtbaar zijn (org of systeem)
    const item = await this.prisma.checklistItem.findFirst({
      where: {
        id: dto.checklistItemId,
        isActive: true,
        ...(orgId
          ? { OR: [{ orgId }, { orgId: null, isSystem: true }] }
          : {}),
      },
    });
    if (!item) throw new NotFoundException('Checklist-item niet gevonden');

    const existingLink = await this.prisma.checklistItemLink.findFirst({
      where: { checklistId, checklistItemId: dto.checklistItemId },
    });
    if (existingLink) {
      throw new BadRequestException('Item zit al in deze checklist');
    }

    const maxSort = await this.prisma.checklistItemLink.aggregate({
      where: { checklistId },
      _max: { sortOrder: true },
    });
    const sortOrder = dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1;

    return this.prisma.checklistItemLink.create({
      data: {
        checklistId,
        checklistItemId: dto.checklistItemId,
        sortOrder,
        isRequired: dto.isRequired ?? true,
        categoryOverride: dto.categoryOverride,
      },
      include: { checklistItem: { include: { category: true } } },
    });
  }

  async updateItemLink(linkId: string, user: User, dto: UpdateItemLinkDto) {
    const link = await this.prisma.checklistItemLink.findUnique({
      where: { id: linkId },
      include: { checklist: true },
    });
    if (!link) throw new NotFoundException('Item-koppeling niet gevonden');

    this.assertManageable(link.checklist, user);
    this.assertConcept(link.checklist);

    return this.prisma.checklistItemLink.update({
      where: { id: linkId },
      data: {
        sortOrder: dto.sortOrder,
        isRequired: dto.isRequired,
        categoryOverride: dto.categoryOverride,
      },
      include: { checklistItem: { include: { category: true } } },
    });
  }

  async removeItem(linkId: string, user: User) {
    const link = await this.prisma.checklistItemLink.findUnique({
      where: { id: linkId },
      include: { checklist: true },
    });
    if (!link) throw new NotFoundException('Item-koppeling niet gevonden');

    this.assertManageable(link.checklist, user);
    this.assertConcept(link.checklist);

    await this.prisma.checklistItemLink.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  async reorderItems(checklistId: string, user: User, itemLinkIds: string[]) {
    const checklist = await this.findById(checklistId, user);
    this.assertManageable(checklist, user);
    this.assertConcept(checklist);

    await this.prisma.$transaction(
      itemLinkIds.map((linkId, index) =>
        this.prisma.checklistItemLink.update({
          where: { id: linkId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findById(checklistId, user);
  }

  // ── Versiebeheer ──────────────────────────────────────

  /** CONCEPT → ACTIEF (schrijft versie-historie). */
  async publish(id: string, user: User, dto: PublishChecklistDto) {
    const checklist = await this.findById(id, user);
    this.assertManageable(checklist, user);

    if (checklist.status !== ChecklistStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen CONCEPT-checklists kunnen gepubliceerd worden',
      );
    }
    if (checklist.itemLinks.length === 0) {
      throw new BadRequestException(
        'Een checklist zonder items kan niet gepubliceerd worden',
      );
    }

    const snapshot = {
      name: checklist.name,
      code: checklist.code,
      description: checklist.description,
      normTypeCode: checklist.normTypeCode,
      assetTypes: checklist.assetTypes,
      locationTypes: checklist.locationTypes,
      items: checklist.itemLinks.map((link) => ({
        code: link.checklistItem.code,
        question: link.checklistItem.question,
        category: link.categoryOverride ?? link.checklistItem.category?.name,
        sortOrder: link.sortOrder,
        isRequired: link.isRequired,
      })),
    };

    const [updatedChecklist] = await this.prisma.$transaction([
      this.prisma.checklist.update({
        where: { id },
        data: {
          status: ChecklistStatus.ACTIEF,
          publishedAt: new Date(),
          updatedBy: user.id,
        },
      }),
      this.prisma.checklistVersionHistory.create({
        data: {
          checklistId: id,
          fromVersion: checklist.version,
          toVersion: checklist.version,
          fromStatus: ChecklistStatus.CONCEPT,
          toStatus: ChecklistStatus.ACTIEF,
          changeDescription: dto.changeDescription,
          approvalReason: dto.approvalReason,
          changedBy: user.id,
          snapshot,
        },
      }),
    ]);

    return updatedChecklist;
  }

  /** ACTIEF → VERVALLEN (schrijft versie-historie). */
  async retire(id: string, user: User, dto: RetireChecklistDto) {
    const checklist = await this.findById(id, user);
    this.assertManageable(checklist, user);

    if (checklist.status !== ChecklistStatus.ACTIEF) {
      throw new BadRequestException(
        'Alleen ACTIEVE checklists kunnen vervallen verklaard worden',
      );
    }

    const [updatedChecklist] = await this.prisma.$transaction([
      this.prisma.checklist.update({
        where: { id },
        data: {
          status: ChecklistStatus.VERVALLEN,
          retiredAt: new Date(),
          updatedBy: user.id,
        },
      }),
      this.prisma.checklistVersionHistory.create({
        data: {
          checklistId: id,
          fromVersion: checklist.version,
          toVersion: checklist.version,
          fromStatus: ChecklistStatus.ACTIEF,
          toStatus: ChecklistStatus.VERVALLEN,
          changeDescription: dto.changeDescription,
          approvalReason: dto.approvalReason,
          changedBy: user.id,
        },
      }),
    ]);

    return updatedChecklist;
  }

  /** Nieuwe CONCEPT-versie klonen (bump versie, set previousVersionId, historie). */
  async createNewVersion(id: string, user: User, dto: NewVersionDto) {
    const checklist = await this.findById(id, user);
    this.assertManageable(checklist, user);

    const versionParts = checklist.version.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1] || '0', 10);
    const newVersion = `${major}.${minor + 1}`;

    const itemLinks = await this.prisma.checklistItemLink.findMany({
      where: { checklistId: id },
    });

    const newChecklist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklist.create({
        data: {
          code: checklist.code,
          name: checklist.name,
          description: checklist.description,
          normTypeCode: checklist.normTypeCode,
          assetTypes: checklist.assetTypes,
          locationTypes: checklist.locationTypes,
          isSystem: checklist.isSystem,
          orgId: checklist.orgId,
          version: newVersion,
          status: ChecklistStatus.CONCEPT,
          previousVersionId: id,
          createdBy: user.id,
        },
      });

      if (itemLinks.length > 0) {
        await tx.checklistItemLink.createMany({
          data: itemLinks.map((link) => ({
            checklistId: created.id,
            checklistItemId: link.checklistItemId,
            sortOrder: link.sortOrder,
            isRequired: link.isRequired,
            categoryOverride: link.categoryOverride,
          })),
        });
      }

      await tx.checklistVersionHistory.create({
        data: {
          checklistId: created.id,
          fromVersion: checklist.version,
          toVersion: newVersion,
          fromStatus: checklist.status,
          toStatus: ChecklistStatus.CONCEPT,
          changeDescription: dto.changeDescription ?? 'Nieuwe versie aangemaakt',
          changedBy: user.id,
        },
      });

      return created;
    });

    return this.findById(newChecklist.id, user);
  }

  /** Versie-historie van een checklist. */
  async getHistory(id: string, user: User) {
    await this.findById(id, user); // toegangscontrole
    return this.prisma.checklistVersionHistory.findMany({
      where: { checklistId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  // ── Import / Export ───────────────────────────────────

  async export(id: string, user: User) {
    const checklist = await this.findById(id, user);

    return {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.id,
      checklist: {
        code: checklist.code,
        name: checklist.name,
        description: checklist.description,
        normTypeCode: checklist.normTypeCode,
        assetTypes: checklist.assetTypes,
        locationTypes: checklist.locationTypes,
        version: checklist.version,
      },
      items: checklist.itemLinks.map((link) => ({
        code: link.checklistItem.code,
        question: link.checklistItem.question,
        instruction: link.checklistItem.instruction,
        normReference: link.checklistItem.normReference,
        category: link.categoryOverride ?? link.checklistItem.category?.name,
        sortOrder: link.sortOrder,
        isRequired: link.isRequired,
        defaultFindingTemplateCodes: [],
      })),
    };
  }

  async import(user: User, dto: ImportChecklistDto) {
    const orgId = user.orgId;
    const isSystem = orgId === null;

    await this.assertNormTypeExists(dto.checklist.normTypeCode);

    const checklist = await this.prisma.checklist.create({
      data: {
        code: dto.checklist.code,
        name: dto.checklist.name,
        description: dto.checklist.description,
        normTypeCode: dto.checklist.normTypeCode,
        assetTypes: dto.checklist.assetTypes,
        locationTypes: dto.checklist.locationTypes ?? [],
        isSystem,
        orgId: isSystem ? null : orgId,
        version: '1.0',
        status: ChecklistStatus.CONCEPT,
        createdBy: user.id,
      },
    });

    for (const importItem of dto.items) {
      // Bestaand item zoeken op code (org of systeem)
      let item = importItem.code
        ? await this.prisma.checklistItem.findFirst({
            where: {
              code: importItem.code,
              isActive: true,
              ...(orgId
                ? { OR: [{ orgId }, { orgId: null, isSystem: true }] }
                : {}),
            },
          })
        : null;

      if (!item) {
        // Categorie zoeken op naam (org of systeem)
        let categoryId: string | null = null;
        if (importItem.category) {
          const cat = await this.prisma.category.findFirst({
            where: {
              name: importItem.category,
              OR: [...(orgId ? [{ orgId }] : []), { isSystem: true }],
            },
            orderBy: { isSystem: 'desc' },
          });
          categoryId = cat?.id || null;
        }

        item = await this.prisma.checklistItem.create({
          data: {
            code: importItem.code,
            question: importItem.question,
            instruction: importItem.instruction,
            normReference: importItem.normReference,
            categoryId,
            isSystem,
            orgId: isSystem ? null : orgId,
            createdBy: user.id,
          },
        });
      }

      await this.prisma.checklistItemLink.create({
        data: {
          checklistId: checklist.id,
          checklistItemId: item.id,
          sortOrder: importItem.sortOrder,
          isRequired: importItem.isRequired,
          categoryOverride: importItem.category,
        },
      });
    }

    return this.findById(checklist.id, user);
  }

  /** Preview-data voor de PWA (items gegroepeerd per categorie). */
  async getPreview(id: string, user: User) {
    const checklist = await this.findById(id, user);

    const itemsByCategory: Record<
      string,
      Array<{ question: string; isRequired: boolean; normReference?: string }>
    > = {};

    for (const link of checklist.itemLinks) {
      const category =
        link.categoryOverride ?? link.checklistItem.category?.name ?? 'Overig';
      if (!itemsByCategory[category]) itemsByCategory[category] = [];
      itemsByCategory[category].push({
        question: link.checklistItem.question,
        isRequired: link.isRequired,
        normReference: link.checklistItem.normReference ?? undefined,
      });
    }

    return {
      id: checklist.id,
      name: checklist.name,
      version: checklist.version,
      status: checklist.status,
      totalItems: checklist.itemLinks.length,
      requiredItems: checklist.itemLinks.filter((l) => l.isRequired).length,
      categories: Object.keys(itemsByCategory),
      itemsByCategory,
    };
  }

  // ── Helpers ───────────────────────────────────────────

  /** Normcode moet bestaan in NormTypeDefinition. */
  private async assertNormTypeExists(normTypeCode: string): Promise<void> {
    const norm = await this.prisma.normTypeDefinition.findFirst({
      where: { code: normTypeCode, deletedAt: null },
    });
    if (!norm) {
      throw new BadRequestException(`Onbekende normcode: ${normTypeCode}`);
    }
  }

  /** Alleen CONCEPT-checklists zijn bewerkbaar/verwijderbaar. */
  private assertConcept(checklist: { status: ChecklistStatus }): void {
    if (checklist.status !== ChecklistStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen checklists met status CONCEPT kunnen gewijzigd worden',
      );
    }
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    checklist: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    if (checklist.isSystem) {
      if (user.orgId !== null) {
        throw new ForbiddenException('Systeem-checklists zijn alleen-lezen');
      }
    } else if (checklist.orgId !== user.orgId) {
      throw new ForbiddenException('Deze checklist hoort niet bij uw organisatie');
    }
  }
}
