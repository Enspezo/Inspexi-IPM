import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { HelpAudience, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, assertFound, isSuperuser } from '@/common';
import { slugify, uniqueSlug } from './help.helpers';
import {
  CreateHelpArticleDto,
  UpdateHelpArticleDto,
  ListHelpArticlesDto,
  CreateHelpCategoryDto,
  UpdateHelpCategoryDto,
} from './dto';

const ARTICLE_SORT = ['title', 'order', 'viewCount', 'createdAt', 'updatedAt'];

/** Gedeelde include: artikel + compacte categorie (id/naam/slug). */
const ARTICLE_CATEGORY_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
} as const;

type HelpArticleWithCategory = Prisma.HelpArticleGetPayload<{
  include: typeof ARTICLE_CATEGORY_INCLUDE;
}>;

@Injectable()
export class HelpService {
  constructor(private prisma: PrismaService) {}

  /**
   * Org-zichtbaarheid: globaal (orgId null) OF eigen org; SUPERUSER ziet alles.
   * De vorm is identiek voor HelpArticle en HelpCategory (beide modellen hebben
   * `orgId` + `OR`), dus één helper bedient beide where-inputs.
   */
  private orgVisibilityWhere(user: User): { OR?: { orgId: string | null }[] } {
    if (isSuperuser(user)) return {};
    return { OR: [{ orgId: null }, { orgId: user.orgId }] };
  }

  /**
   * Deterministische volgorde voor lezen-op-slug. Door @@unique([orgId, slug])
   * kunnen een globaal én een org-record dezelfde slug hebben.
   * - Gewone gebruiker (scope = {eigen org, globaal}) → org-specifiek wint
   *   (nulls-last), zodat een org-override consistent voorrang heeft.
   * - SUPERUSER (scope = alles) → globaal eerst (nulls-first) voor determinisme.
   * Identiek voor HelpArticle en HelpCategory (beide sorteren op `orgId`).
   */
  private slugOrderBy(
    user: User,
  ): { orgId: { sort: 'asc' | 'desc'; nulls: 'first' | 'last' } } {
    return isSuperuser(user)
      ? { orgId: { sort: 'asc', nulls: 'first' } }
      : { orgId: { sort: 'desc', nulls: 'last' } };
  }

  /**
   * Atomische teller-ophoging buiten de Prisma-client om. Bewust via raw SQL:
   * dit omzeilt de audit-`$use` middleware, zodat een view/feedback géén
   * auditeerbare wijziging wordt. De kolomnaam is een interne literal (geen
   * user-input) en wordt veilig als identifier ge-`raw`-t.
   */
  private bumpCounter(
    id: string,
    column: 'view_count' | 'helpful_yes' | 'helpful_no',
  ) {
    return this.prisma.$executeRaw(
      Prisma.sql`UPDATE imp_help_articles SET ${Prisma.raw(column)} = ${Prisma.raw(
        column,
      )} + 1 WHERE id = ${id}::uuid`,
    );
  }

  // ── Categorieën (lezen) ──────────────────────────────────────────────────
  // De staff-reader toont uitsluitend INTERNAL content; EXTERNAL is voor het
  // klantportaal (zie client-help.service) en mag hier nooit lekken.
  async listCategories(user: User) {
    return this.prisma.helpCategory.findMany({
      where: { isPublished: true, audience: 'INTERNAL', ...this.orgVisibilityWhere(user) },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async getCategoryBySlug(user: User, slug: string) {
    const category = assertFound(
      await this.prisma.helpCategory.findFirst({
        where: { slug, audience: 'INTERNAL', ...this.orgVisibilityWhere(user) },
        orderBy: this.slugOrderBy(user),
      }),
      'Categorie',
    );
    const articles = await this.prisma.helpArticle.findMany({
      where: {
        categoryId: category.id,
        status: 'PUBLISHED',
        audience: 'INTERNAL',
        ...this.orgVisibilityWhere(user),
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
      audience: 'INTERNAL',
      ...this.orgVisibilityWhere(user),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return paginate(this.prisma.helpArticle, {
      where,
      include: ARTICLE_CATEGORY_INCLUDE,
      orderBy: buildOrderBy(sortBy, sortOrder, ARTICLE_SORT, { order: 'asc' }),
      page,
      limit,
    });
  }

  async getArticleBySlug(user: User, slug: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({
        where: {
          slug,
          status: 'PUBLISHED',
          audience: 'INTERNAL',
          ...this.orgVisibilityWhere(user),
        },
        include: ARTICLE_CATEGORY_INCLUDE,
        orderBy: this.slugOrderBy(user),
      }),
      'Artikel',
    );
    // Fire-and-forget viewCount-bump (audit-bypass — zie bumpCounter).
    this.bumpCounter(article.id, 'view_count').catch(() => undefined);
    return article;
  }

  async giveFeedback(user: User, id: string, helpful: boolean) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({
        where: { id, ...this.orgVisibilityWhere(user) },
      }),
      'Artikel',
    );
    await this.bumpCounter(article.id, helpful ? 'helpful_yes' : 'helpful_no');
    return this.prisma.helpArticle.findUnique({
      where: { id: article.id },
      select: { id: true, helpfulYes: true, helpfulNo: true },
    });
  }

  // ── Contextuele suggesties (Fase 3) ──────────────────────────────────────
  /**
   * Suggesties voor de huidige view. moduleKey-match (GIN-index op module_keys)
   * is primair; optionele vrije zoekterm matcht titel/excerpt/tags. Org-specifiek
   * krijgt voorrang boven globaal. Zónder zoekterm valt een module zonder eigen
   * artikelen terug op de meest-bekeken artikelen (paneel nooit leeg); mét een
   * zoekterm geeft "geen treffers" een lege lijst (de UI toont "geen resultaten").
   */
  async getContextual(
    user: User,
    moduleKey?: string,
    q?: string,
    limit = 20,
  ): Promise<{ items: HelpArticleWithCategory[] }> {
    const orderBy: Prisma.HelpArticleOrderByWithRelationInput[] = [
      { viewCount: 'desc' },
      { order: 'asc' },
    ];
    const base: Prisma.HelpArticleWhereInput = {
      status: 'PUBLISHED',
      audience: 'INTERNAL',
      ...this.orgVisibilityWhere(user),
    };

    const primaryWhere: Prisma.HelpArticleWhereInput = {
      ...base,
      ...(moduleKey ? { moduleKeys: { hasSome: [moduleKey] } } : {}),
      // Tekstmatch via AND-genest, zodat de zichtbaarheids-OR uit `base`
      // (globaal OF eigen org) niet wordt overschreven door deze OR.
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { excerpt: { contains: q, mode: 'insensitive' } },
                  { tags: { hasSome: [q.toLowerCase()] } },
                ],
              },
            ],
          }
        : {}),
    };

    // orderBy maakt de afkapping bij >take treffers deterministisch; de
    // org-voorrang volgt daarna in JS.
    let items = await this.prisma.helpArticle.findMany({
      where: primaryWhere,
      include: ARTICLE_CATEGORY_INCLUDE,
      orderBy,
      take: 50,
    });

    // Fallback alleen zónder actieve zoekterm: een module zonder eigen artikelen
    // mag niet leeg blijven, maar een zoekopdracht zonder treffers hoort "geen
    // resultaten" te tonen i.p.v. ongerelateerde populaire artikelen.
    if (items.length === 0 && !q) {
      items = await this.prisma.helpArticle.findMany({
        where: base,
        include: ARTICLE_CATEGORY_INCLUDE,
        orderBy,
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

    return { items: items.slice(0, limit) };
  }

  // ── Beheer: scope-resolutie ──────────────────────────────────────────────
  /** Bepaalt de orgId waaronder geschreven wordt + bewaakt schrijfrechten. */
  private resolveWriteOrgId(user: User, requestedOrgId?: string | null): string | null {
    if (isSuperuser(user)) return requestedOrgId ?? null; // superuser: globaal of gekozen org
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
    const audience = dto.audience ?? HelpAudience.INTERNAL;
    const orgId = this.resolveWriteOrgId(user, dto.orgId);
    // Externe categorieën zijn altijd per-org (geen globale externe KB).
    if (audience === HelpAudience.EXTERNAL && !orgId) {
      throw new BadRequestException('Externe categorieën vereisen een organisatie');
    }
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
        audience,
        // isPublic is alleen zinvol voor EXTERNAL; intern altijd false.
        isPublic: audience === HelpAudience.EXTERNAL ? dto.isPublic ?? false : false,
      },
    });
  }

  async updateCategory(user: User, id: string, dto: UpdateHelpCategoryDto) {
    const cat = assertFound(
      await this.prisma.helpCategory.findUnique({ where: { id } }),
      'Categorie',
    );
    if (!isSuperuser(user) && cat.orgId !== user.orgId) {
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
        // audience is onveranderlijk (zou artikelen ontkoppelen); alleen de
        // publiek/afgeschermd-vlag is bij een externe categorie aanpasbaar.
        ...(dto.isPublic !== undefined && cat.audience === HelpAudience.EXTERNAL
          ? { isPublic: dto.isPublic }
          : {}),
      },
    });
  }

  async deleteCategory(user: User, id: string) {
    const cat = assertFound(
      await this.prisma.helpCategory.findUnique({ where: { id } }),
      'Categorie',
    );
    if (!isSuperuser(user) && cat.orgId !== user.orgId) {
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

  // ── Beheer: categorieën (lijst, alle doelgroepen in scope) ───────────────
  /**
   * Beheerlijst van categorieën: anders dan de reader-`listCategories` toont dit
   * óók niet-gepubliceerde en (optioneel gefilterd) EXTERNAL categorieën, zodat
   * het beheer intern + extern op één plek kan beheren.
   */
  async adminListCategories(user: User, audience?: HelpAudience) {
    return this.prisma.helpCategory.findMany({
      where: {
        ...this.orgVisibilityWhere(user),
        ...(audience ? { audience } : {}),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  // ── Beheer: artikelen (incl. concepten in scope) ─────────────────────────
  async adminListArticles(user: User, q: ListHelpArticlesDto) {
    const {
      categoryId,
      search,
      status,
      audience,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder = 'desc',
    } = q;
    const where: Prisma.HelpArticleWhereInput = {
      ...this.orgVisibilityWhere(user), // SUPERUSER: alles; ORG_ADMIN: globaal + eigen org
      ...(status ? { status } : {}),
      ...(audience ? { audience } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return paginate(this.prisma.helpArticle, {
      where,
      include: ARTICLE_CATEGORY_INCLUDE,
      orderBy: buildOrderBy(sortBy, sortOrder, ARTICLE_SORT, { updatedAt: 'desc' }),
      page,
      limit,
    });
  }

  async createArticle(user: User, dto: CreateHelpArticleDto) {
    const audience = dto.audience ?? HelpAudience.INTERNAL;
    const orgId = this.resolveWriteOrgId(user, dto.orgId);
    if (audience === HelpAudience.EXTERNAL && !orgId) {
      throw new BadRequestException('Externe artikelen vereisen een organisatie');
    }
    const category = await this.assertCategoryInScope(user, dto.categoryId, orgId);
    if (category.audience !== audience) {
      throw new BadRequestException(
        audience === HelpAudience.EXTERNAL
          ? 'Kies een externe categorie voor een extern artikel'
          : 'Kies een interne categorie voor een intern artikel',
      );
    }
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
        // Externe artikelen koppelen niet aan modules (geen contextuele suggesties).
        moduleKeys: audience === HelpAudience.EXTERNAL ? [] : dto.moduleKeys ?? [],
        order: dto.order ?? 0,
        status: 'DRAFT',
        audience,
        authorId: user.id,
      },
    });
  }

  async updateArticle(user: User, id: string, dto: UpdateHelpArticleDto) {
    const article = assertFound(
      await this.prisma.helpArticle.findUnique({ where: { id } }),
      'Artikel',
    );
    if (!isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    if (dto.categoryId) {
      const category = await this.assertCategoryInScope(
        user,
        dto.categoryId,
        article.orgId,
      );
      if (category.audience !== article.audience) {
        throw new BadRequestException(
          'De categorie hoort bij een andere doelgroep dan dit artikel',
        );
      }
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
        // moduleKeys blijven leeg voor externe artikelen.
        ...(dto.moduleKeys !== undefined && article.audience === HelpAudience.INTERNAL
          ? { moduleKeys: dto.moduleKeys }
          : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async publishArticle(user: User, id: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findUnique({ where: { id } }),
      'Artikel',
    );
    if (!isSuperuser(user) && article.orgId !== user.orgId) {
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
    if (!isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    await this.prisma.helpArticle.delete({ where: { id } });
    return { id };
  }
}
