import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSystemRowManageable, paginate } from '@/common';
import {
  CreateFindingTemplateDto,
  UpdateFindingTemplateDto,
  QueryFindingTemplatesDto,
  ImportFindingTemplatesDto,
  FindingTemplateExport,
} from './dto';

const TEMPLATE_INCLUDE = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  classificationModel: {
    include: {
      characteristics: {
        orderBy: { sortOrder: 'asc' as const },
        include: { options: { orderBy: { sortOrder: 'asc' as const } } },
      },
    },
  },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.FindingTemplateInclude;

@Injectable()
export class FindingTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alle (zichtbare) templates: eigen org + systeem. Superuser (orgId null) ziet alles. */
  async findAll(user: User, query: QueryFindingTemplatesDto) {
    const orgId = user.orgId;
    const {
      search,
      categoryId,
      classificationModelId,
      includeSystem = true,
      includeInactive = false,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.FindingTemplateWhereInput = {
      AND: [
        includeInactive ? {} : { isActive: true },
        // Org-scope: eigen org + systeem (superuser ziet alles)
        orgId
          ? {
              OR: [
                { orgId },
                ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
              ],
            }
          : {},
        search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' as const } },
                { shortDescription: { contains: search, mode: 'insensitive' as const } },
                { category: { name: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {},
        categoryId ? { categoryId } : {},
        classificationModelId ? { classificationModelId } : {},
      ],
    };

    return paginate(this.prisma.findingTemplate, {
      where,
      include: TEMPLATE_INCLUDE,
      orderBy: [{ category: { name: 'asc' } }, { shortDescription: 'asc' }],
      page,
      limit,
    });
  }

  /**
   * Alle ACTIEVE templates (eigen org + systeem) zonder paginatie — voor de inspecteur-PWA,
   * die alle constatering-templates in één call offline cachet. Superuser (orgId null) ziet
   * alles. Dezelfde org-scope en item-vorm als findAll, maar zonder limit/paginatie-envelope.
   */
  async findAllActive(user: User) {
    const orgId = user.orgId;
    const where: Prisma.FindingTemplateWhereInput = {
      AND: [
        { isActive: true },
        orgId ? { OR: [{ orgId }, { orgId: null, isSystem: true }] } : {},
      ],
    };

    return this.prisma.findingTemplate.findMany({
      where,
      include: TEMPLATE_INCLUDE,
      orderBy: [{ category: { name: 'asc' } }, { shortDescription: 'asc' }],
    });
  }

  /** Categorieën die door templates worden gebruikt (eigen org + systeem). */
  async getUsedCategories(user: User, includeSystem = true) {
    const orgId = user.orgId;
    const where: Prisma.FindingTemplateWhereInput = {
      isActive: true,
      categoryId: { not: null },
      ...(orgId
        ? {
            OR: [
              { orgId },
              ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
            ],
          }
        : {}),
    };

    const templates = await this.prisma.findingTemplate.findMany({
      where,
      select: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      distinct: ['categoryId'],
    });

    return templates
      .map((t) => t.category)
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const template = await this.prisma.findingTemplate.findFirst({
      where: {
        id,
        ...(orgId ? { OR: [{ orgId }, { orgId: null, isSystem: true }] } : {}),
      },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Constateringssjabloon niet gevonden');
    return template;
  }

  async create(user: User, dto: CreateFindingTemplateDto) {
    const orgId = user.orgId;
    const isSystem = orgId === null; // superuser → systeemsjabloon

    // FK: classificatiemodel is globaal — moet bestaan
    const model = assertFound(
      await this.prisma.classificationModel.findUnique({
        where: { id: dto.classificationModelId },
        include: { characteristics: true },
      }),
      'Classificatiemodel',
    );

    // FK: categorie is org-OF-systeem — laad en controleer toegang
    if (dto.categoryId) {
      await this.assertCategoryUsable(dto.categoryId, user);
    }

    // Valideer defaultClassification-keys tegen de kenmerken van het model
    this.assertValidClassificationKeys(model.characteristics, dto.defaultClassification);

    // Dubbele code binnen org-scope voorkomen
    if (dto.code) {
      const existing = await this.prisma.findingTemplate.findFirst({
        where: { code: dto.code, orgId: isSystem ? null : orgId },
      });
      if (existing) {
        throw new BadRequestException(`Sjabloon met code '${dto.code}' bestaat al`);
      }
    }

    return this.prisma.findingTemplate.create({
      data: {
        isSystem,
        orgId: isSystem ? null : orgId,
        code: dto.code,
        categoryId: dto.categoryId,
        shortDescription: dto.shortDescription,
        longDescription: dto.longDescription,
        explanation: dto.explanation,
        normReference: dto.normReference,
        classificationModelId: dto.classificationModelId,
        defaultClassification: (dto.defaultClassification ?? {}) as Prisma.InputJsonValue,
        createdBy: user.id,
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  async update(id: string, user: User, dto: UpdateFindingTemplateDto) {
    const template = await this.findById(id, user);
    this.assertManageable(template, user);

    // FK: nieuwe categorie moet org-of-systeem zijn
    if (dto.categoryId) {
      await this.assertCategoryUsable(dto.categoryId, user);
    }

    // FK: als het classificatiemodel wijzigt, valideren dat het bestaat
    if (dto.classificationModelId && dto.classificationModelId !== template.classificationModelId) {
      assertFound(
        await this.prisma.classificationModel.findUnique({
          where: { id: dto.classificationModelId },
        }),
        'Classificatiemodel',
      );
      // Reset standaardclassificatie als het model wijzigt en er geen nieuwe is meegegeven
      if (!dto.defaultClassification) {
        dto.defaultClassification = {};
      }
    }

    return this.prisma.findingTemplate.update({
      where: { id },
      data: {
        code: dto.code,
        categoryId: dto.categoryId,
        shortDescription: dto.shortDescription,
        longDescription: dto.longDescription,
        explanation: dto.explanation,
        normReference: dto.normReference,
        classificationModelId: dto.classificationModelId,
        defaultClassification: dto.defaultClassification as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  /** Soft-delete (isActive = false). */
  async delete(id: string, user: User) {
    const template = await this.findById(id, user);
    this.assertManageable(template, user);
    return this.prisma.findingTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Sjabloon kopiëren naar de eigen org (systeem → org fork). Vereist een org. */
  async duplicate(id: string, user: User, newCode?: string) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Een organisatie is vereist om te dupliceren');
    }
    const source = await this.findById(id, user);

    const code = newCode ?? (source.code ? `${source.code}-COPY` : null);

    if (code) {
      const existing = await this.prisma.findingTemplate.findFirst({
        where: { code, orgId },
      });
      if (existing) {
        throw new BadRequestException(`U heeft al een sjabloon met code '${code}'`);
      }
    }

    return this.prisma.findingTemplate.create({
      data: {
        isSystem: false,
        orgId,
        code,
        categoryId: source.categoryId,
        shortDescription: source.shortDescription,
        longDescription: source.longDescription,
        explanation: source.explanation,
        normReference: source.normReference,
        classificationModelId: source.classificationModelId,
        defaultClassification: source.defaultClassification as Prisma.InputJsonValue,
        createdBy: user.id,
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  /** Exporteer templates naar JSON. */
  async export(user: User, ids: string[] | undefined): Promise<FindingTemplateExport> {
    const orgId = user.orgId;
    const where: Prisma.FindingTemplateWhereInput = ids?.length
      ? {
          id: { in: ids },
          ...(orgId ? { OR: [{ orgId }, { orgId: null, isSystem: true }] } : {}),
        }
      : orgId
        ? { orgId, isActive: true }
        : { isActive: true };

    const templates = await this.prisma.findingTemplate.findMany({
      where,
      include: { category: true, classificationModel: true },
    });

    return {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      findingTemplates: templates.map((t) => ({
        code: t.code ?? undefined,
        category: t.category?.name ?? undefined,
        shortDescription: t.shortDescription,
        longDescription: t.longDescription ?? undefined,
        explanation: t.explanation ?? undefined,
        normReference: t.normReference ?? undefined,
        classificationModelCode: t.classificationModel?.code ?? undefined,
        defaultClassification: t.defaultClassification as Record<string, string> | undefined,
      })),
    };
  }

  /** Importeer templates uit JSON (altijd als org-templates). */
  async import(user: User, dto: ImportFindingTemplatesDto) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Een organisatie is vereist om te importeren');
    }

    const results: { imported: number; skipped: number; errors: string[] } = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    for (const template of dto.findingTemplates) {
      try {
        const model = await this.prisma.classificationModel.findUnique({
          where: { code: template.classificationModelCode },
        });
        if (!model) {
          results.errors.push(
            `Sjabloon "${template.shortDescription}": classificatiemodel "${template.classificationModelCode}" niet gevonden`,
          );
          results.skipped++;
          continue;
        }

        if (template.code) {
          const existing = await this.prisma.findingTemplate.findFirst({
            where: { code: template.code, orgId },
          });
          if (existing) {
            results.errors.push(
              `Sjabloon "${template.shortDescription}": code "${template.code}" bestaat al`,
            );
            results.skipped++;
            continue;
          }
        }

        // Categorie op naam opzoeken (org of systeem; org heeft voorrang)
        let categoryId: string | null = null;
        if (template.category) {
          const cat = await this.prisma.category.findFirst({
            where: {
              name: template.category,
              OR: [{ orgId }, { orgId: null, isSystem: true }],
            },
            orderBy: { isSystem: 'asc' },
          });
          categoryId = cat?.id ?? null;
        }

        await this.prisma.findingTemplate.create({
          data: {
            isSystem: false,
            orgId,
            code: template.code,
            categoryId,
            shortDescription: template.shortDescription,
            longDescription: template.longDescription,
            explanation: template.explanation,
            normReference: template.normReference,
            classificationModelId: model.id,
            defaultClassification: (template.defaultClassification ?? {}) as Prisma.InputJsonValue,
            createdBy: user.id,
          },
        });

        results.imported++;
      } catch (error) {
        results.errors.push(
          `Sjabloon "${template.shortDescription}": ${(error as Error).message}`,
        );
        results.skipped++;
      }
    }

    return results;
  }

  // ── Helpers ───────────────────────────────────────────

  /** Categorie moet bestaan en org-of-systeem zijn (geen vreemde-org categorie). */
  private async assertCategoryUsable(categoryId: string, user: User): Promise<void> {
    const category = assertFound(
      await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { orgId: true },
      }),
      'Categorie',
    );
    // Org-of-systeem check: systeem (orgId null) of eigen org is toegestaan.
    // Superuser (user.orgId null) mag alles.
    if (user.orgId !== null && category.orgId !== null && category.orgId !== user.orgId) {
      throw new ForbiddenException('Categorie hoort niet bij uw organisatie');
    }
  }

  /** Keys van defaultClassification moeten kenmerkcodes van het model zijn. */
  private assertValidClassificationKeys(
    characteristics: { code: string }[],
    defaultClassification: Record<string, string> | undefined,
  ): void {
    if (!defaultClassification) return;
    const charCodes = characteristics.map((c) => c.code);
    const invalid = Object.keys(defaultClassification).filter((code) => !charCodes.includes(code));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Ongeldige kenmerkcodes in standaardclassificatie: ${invalid.join(', ')}`,
      );
    }
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    template: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    assertSystemRowManageable(template, user, {
      system: 'Systeem-constateringssjablonen zijn alleen-lezen. Dupliceer eerst.',
      org: 'Dit sjabloon hoort niet bij uw organisatie',
    });
  }
}
