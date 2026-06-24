import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, assertFound } from '@/common';
import { slugify, uniqueSlug } from './help.helpers';
import {
  CreateHelpArticleDto,
  UpdateHelpArticleDto,
  ListHelpArticlesDto,
  CreateHelpCategoryDto,
  UpdateHelpCategoryDto,
} from './dto';

const ARTICLE_SORT = ['title', 'order', 'viewCount', 'createdAt', 'updatedAt'];

@Injectable()
export class HelpService {
  constructor(private prisma: PrismaService) {}

  private isSuperuser(user: User) {
    return user.roles.includes(Role.SUPERUSER);
  }

  /** Zichtbaarheid voor artikelen: globaal (orgId null) OF eigen org. SUPERUSER ziet alles. */
  private visibilityWhere(user: User): Prisma.HelpArticleWhereInput {
    if (this.isSuperuser(user)) return {};
    return { OR: [{ orgId: null }, { orgId: user.orgId }] };
  }

  /** Zichtbaarheid voor categorieën: globaal OF eigen org. SUPERUSER ziet alles. */
  private categoryVisibilityWhere(user: User): Prisma.HelpCategoryWhereInput {
    if (this.isSuperuser(user)) return {};
    return { OR: [{ orgId: null }, { orgId: user.orgId }] };
  }

  /**
   * Deterministische volgorde voor lezen-op-slug. Door @@unique([orgId, slug])
   * kunnen een globaal én een org-artikel dezelfde slug hebben.
   * - Gewone gebruiker (scope = {eigen org, globaal}) → org-specifiek wint (nulls-last),
   *   zodat een org-override consistent voorrang heeft op de globale versie.
   * - SUPERUSER (scope = alles) → globaal eerst (nulls-first) voor determinisme.
   */
  private articleSlugOrderBy(user: User): Prisma.HelpArticleOrderByWithRelationInput {
    return this.isSuperuser(user)
      ? { orgId: { sort: 'asc', nulls: 'first' } }
      : { orgId: { sort: 'desc', nulls: 'last' } };
  }

  private categorySlugOrderBy(user: User): Prisma.HelpCategoryOrderByWithRelationInput {
    return this.isSuperuser(user)
      ? { orgId: { sort: 'asc', nulls: 'first' } }
      : { orgId: { sort: 'desc', nulls: 'last' } };
  }

  // ── Categorieën (lezen) ──────────────────────────────────────────────────
  async listCategories(user: User) {
    return this.prisma.helpCategory.findMany({
      where: { isPublished: true, ...this.categoryVisibilityWhere(user) },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async getCategoryBySlug(user: User, slug: string) {
    const category = assertFound(
      await this.prisma.helpCategory.findFirst({
        where: { slug, ...this.categoryVisibilityWhere(user) },
        orderBy: this.categorySlugOrderBy(user),
      }),
      'Categorie',
    );
    const articles = await this.prisma.helpArticle.findMany({
      where: {
        categoryId: category.id,
        status: 'PUBLISHED',
        ...this.visibilityWhere(user),
      },
      orderBy: [{ order: 'asc' }, { title: 'asc' }],
    });
    return { ...category, articles };
  }

  // ── Artikelen (lezen) ────────────────────────────────────────────────────
  async listArticles(user: User, q: ListHelpArticlesDto) {
    const { categoryId, search, page = 1, limit = 20, sortBy, sortOrder = 'asc' } = q;
    const where: Prisma.HelpArticleWhereInput = {
      status: 'PUBLISHED',
      ...this.visibilityWhere(user),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return paginate(this.prisma.helpArticle, {
      where,
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: buildOrderBy(sortBy, sortOrder, ARTICLE_SORT, { order: 'asc' }),
      page,
      limit,
    });
  }

  async getArticleBySlug(user: User, slug: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({
        where: { slug, status: 'PUBLISHED', ...this.visibilityWhere(user) },
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: this.articleSlugOrderBy(user),
      }),
      'Artikel',
    );
    // viewCount via raw SQL → omzeilt de audit-$use-middleware (geen audit-rij per view)
    this.prisma
      .$executeRaw`UPDATE imp_help_articles SET view_count = view_count + 1 WHERE id = ${article.id}::uuid`
      .catch(() => undefined);
    return article;
  }

  async giveFeedback(user: User, id: string, helpful: boolean) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({
        where: { id, ...this.visibilityWhere(user) },
      }),
      'Artikel',
    );
    // raw SQL → omzeilt audit-middleware (feedback is geen auditeerbare wijziging)
    if (helpful) {
      await this.prisma
        .$executeRaw`UPDATE imp_help_articles SET helpful_yes = helpful_yes + 1 WHERE id = ${article.id}::uuid`;
    } else {
      await this.prisma
        .$executeRaw`UPDATE imp_help_articles SET helpful_no = helpful_no + 1 WHERE id = ${article.id}::uuid`;
    }
    return this.prisma.helpArticle.findUnique({
      where: { id: article.id },
      select: { id: true, helpfulYes: true, helpfulNo: true },
    });
  }

  // ── Contextuele suggesties (Fase 3) ──────────────────────────────────────
  /**
   * Suggesties voor de huidige view. moduleKey-match (GIN-index op module_keys)
   * is primair; optionele vrije zoekterm matcht titel/excerpt/tags. Org-specifiek
   * krijgt voorrang boven globaal. Bij geen treffers een fallback (meest bekeken)
   * zodat het paneel nooit leeg is. `total` laat de UI "Meer" tonen.
   */
  async getContextual(
    user: User,
    moduleKey?: string,
    q?: string,
    limit = 20,
  ): Promise<{ items: unknown[]; total: number }> {
    const include = { category: { select: { id: true, name: true, slug: true } } };
    const base: Prisma.HelpArticleWhereInput = {
      status: 'PUBLISHED',
      ...this.visibilityWhere(user),
    };

    const primaryWhere: Prisma.HelpArticleWhereInput = {
      ...base,
      ...(moduleKey ? { moduleKeys: { hasSome: [moduleKey] } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
              { tags: { hasSome: [q.toLowerCase()] } },
            ],
          }
        : {}),
    };

    let items = await this.prisma.helpArticle.findMany({
      where: primaryWhere,
      include,
      take: 50,
    });

    // Fallback: nooit een leeg paneel.
    if (items.length === 0) {
      items = await this.prisma.helpArticle.findMany({
        where: base,
        include,
        orderBy: [{ viewCount: 'desc' }, { order: 'asc' }],
        take: limit,
      });
    }

    // Rangschikking: org-specifiek vóór globaal, daarna meest bekeken / volgorde.
    items.sort((a, b) => {
      const orgRank = Number(b.orgId !== null) - Number(a.orgId !== null);
      if (orgRank !== 0) return orgRank;
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
      return a.order - b.order;
    });

    return { items: items.slice(0, limit), total: items.length };
  }

  // ── Beheer: scope-resolutie ──────────────────────────────────────────────
  /** Bepaalt de orgId waaronder geschreven wordt + bewaakt schrijfrechten. */
  private resolveWriteOrgId(user: User, requestedOrgId?: string | null): string | null {
    if (this.isSuperuser(user)) return requestedOrgId ?? null; // superuser: globaal of gekozen org
    // ORG_ADMIN mag alleen voor eigen org schrijven (nooit globaal)
    if (requestedOrgId && requestedOrgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten voor deze organisatie');
    }
    return user.orgId!;
  }

  private async assertCategoryInScope(
    user: User,
    categoryId: string,
    writeOrgId: string | null,
  ) {
    const cat = assertFound(
      await this.prisma.helpCategory.findUnique({ where: { id: categoryId } }),
      'Categorie',
    );
    // categorie moet globaal zijn of bij dezelfde scope horen
    if (cat.orgId !== null && cat.orgId !== writeOrgId) {
      throw new ForbiddenException('Categorie hoort niet bij deze organisatie');
    }
    return cat;
  }

  // ── Beheer: categorieën ──────────────────────────────────────────────────
  async createCategory(user: User, dto: CreateHelpCategoryDto) {
    const orgId = this.resolveWriteOrgId(user, dto.orgId);
    const slug = await uniqueSlug(
      (s) =>
        this.prisma.helpCategory
          .findFirst({ where: { orgId, slug: s }, select: { id: true } })
          .then(Boolean),
      slugify(dto.slug ?? dto.name),
    );
    return this.prisma.helpCategory.create({
      data: {
        orgId,
        slug,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        order: dto.order ?? 0,
        parentId: dto.parentId,
      },
    });
  }

  async updateCategory(user: User, id: string, dto: UpdateHelpCategoryDto) {
    const cat = assertFound(
      await this.prisma.helpCategory.findUnique({ where: { id } }),
      'Categorie',
    );
    if (!this.isSuperuser(user) && cat.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op deze categorie'); // ORG_ADMIN kan globaal niet wijzigen
    }
    let nextSlug: string | undefined;
    if (dto.slug !== undefined) {
      const normalized = slugify(dto.slug);
      if (normalized !== cat.slug) {
        nextSlug = await uniqueSlug(
          (s) =>
            this.prisma.helpCategory
              .findFirst({
                where: { orgId: cat.orgId, slug: s, id: { not: cat.id } },
                select: { id: true },
              })
              .then(Boolean),
          normalized,
        );
      }
    }
    return this.prisma.helpCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  async deleteCategory(user: User, id: string) {
    const cat = assertFound(
      await this.prisma.helpCategory.findUnique({ where: { id } }),
      'Categorie',
    );
    if (!this.isSuperuser(user) && cat.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op deze categorie');
    }
    const [articleCount, childCount] = await Promise.all([
      this.prisma.helpArticle.count({ where: { categoryId: id } }),
      this.prisma.helpCategory.count({ where: { parentId: id } }),
    ]);
    if (articleCount > 0 || childCount > 0) {
      throw new BadRequestException(
        'Categorie bevat nog artikelen of subcategorieën',
      );
    }
    await this.prisma.helpCategory.delete({ where: { id } });
    return { id };
  }

  // ── Beheer: artikelen (incl. concepten in scope) ─────────────────────────
  async adminListArticles(user: User, q: ListHelpArticlesDto) {
    const {
      categoryId,
      search,
      status,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder = 'desc',
    } = q;
    const where: Prisma.HelpArticleWhereInput = {
      ...this.visibilityWhere(user), // SUPERUSER: alles; ORG_ADMIN: globaal + eigen org
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return paginate(this.prisma.helpArticle, {
      where,
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: buildOrderBy(sortBy, sortOrder, ARTICLE_SORT, { updatedAt: 'desc' }),
      page,
      limit,
    });
  }

  async createArticle(user: User, dto: CreateHelpArticleDto) {
    const orgId = this.resolveWriteOrgId(user, dto.orgId);
    await this.assertCategoryInScope(user, dto.categoryId, orgId);
    const slug = await uniqueSlug(
      (s) =>
        this.prisma.helpArticle
          .findFirst({ where: { orgId, slug: s }, select: { id: true } })
          .then(Boolean),
      slugify(dto.slug ?? dto.title),
    );
    return this.prisma.helpArticle.create({
      data: {
        orgId,
        categoryId: dto.categoryId,
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        body: dto.body,
        tags: dto.tags ?? [],
        moduleKeys: dto.moduleKeys ?? [],
        order: dto.order ?? 0,
        status: 'DRAFT',
        authorId: user.id,
      },
    });
  }

  async updateArticle(user: User, id: string, dto: UpdateHelpArticleDto) {
    const article = assertFound(
      await this.prisma.helpArticle.findUnique({ where: { id } }),
      'Artikel',
    );
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    if (dto.categoryId) {
      await this.assertCategoryInScope(user, dto.categoryId, article.orgId);
    }
    let nextSlug: string | undefined;
    if (dto.slug !== undefined) {
      const normalized = slugify(dto.slug);
      if (normalized !== article.slug) {
        nextSlug = await uniqueSlug(
          (s) =>
            this.prisma.helpArticle
              .findFirst({
                where: { orgId: article.orgId, slug: s, id: { not: article.id } },
                select: { id: true },
              })
              .then(Boolean),
          normalized,
        );
      }
    }
    return this.prisma.helpArticle.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.moduleKeys !== undefined ? { moduleKeys: dto.moduleKeys } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async publishArticle(user: User, id: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findUnique({ where: { id } }),
      'Artikel',
    );
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    return this.prisma.helpArticle.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: article.publishedAt ?? new Date() },
    });
  }

  async deleteArticle(user: User, id: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findUnique({ where: { id } }),
      'Artikel',
    );
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    await this.prisma.helpArticle.delete({ where: { id } });
    return { id };
  }
}
