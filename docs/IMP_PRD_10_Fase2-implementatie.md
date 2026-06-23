# IMP_PRD_10 — Fase 2: Knowledge base (backend + lees-UI + beheer)

> Begeleidend bij `IMP_PRD_10_Helpsysteem.md`. **Fase 2** = de KB werkend krijgen: NestJS `help`-module met zichtbaarheidsfilter, lees-UI op `/help` + artikelpagina, en beheer-UI op `/help/admin` (SUPERUSER → globaal, ORG_ADMIN → eigen org).
> Vereist: **Fase 1** (schema + migratie + seed) is gemerged.
> Contextuele suggesties + widget + chat = **Fase 3**; tickets = **Fase 4** (niet hier).
> Conventies: backend Engels, UI-teksten Nederlands; alle responses `{ success, data }`.

## Te wijzigen / nieuwe bestanden

**Backend (`apps/api`):**
- `src/modules/help/help.module.ts` *(nieuw)*
- `src/modules/help/help.service.ts` *(nieuw)*
- `src/modules/help/help.controller.ts` *(nieuw — lezen, `ALL_STAFF`)*
- `src/modules/help/help-admin.controller.ts` *(nieuw — CRUD, `ORG_ADMINS`)*
- `src/modules/help/help.helpers.ts` *(nieuw — slugify + scope-checks)*
- `src/modules/help/dto/*` *(nieuw)*
- `src/app.module.ts` *(registreer `HelpModule`)*

**Frontend (`apps/portal`):**
- `src/types/index.ts` *(types)*
- `src/lib/status.ts` *(HELP_ARTICLE_STATUS)*
- `src/pages/help/hooks/use-help.ts` *(nieuw)*
- `src/pages/help/help-center-page.tsx` *(nieuw — `/help`)*
- `src/pages/help/help-article-page.tsx` *(nieuw — `/help/article/:slug`)*
- `src/pages/help/help-admin-page.tsx` *(nieuw — `/help/admin`)*
- `src/App.tsx` *(lazy imports + routes)*
- `src/components/layout/sidebar.tsx` *(nav-item)*

---

## A. Backend

### A.1 DTOs — `src/modules/help/dto/`

`dto/index.ts`:

```ts
export * from './create-help-category.dto';
export * from './update-help-category.dto';
export * from './create-help-article.dto';
export * from './update-help-article.dto';
export * from './list-help-articles.dto';
export * from './help-feedback.dto';
```

`dto/create-help-category.dto.ts`:

```ts
import { IsOptional, IsString, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateHelpCategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsUUID() parentId?: string;
  /** Alleen SUPERUSER mag dit zetten; null/weglaten = globaal. ORG_ADMIN wordt server-side geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
```

`dto/update-help-category.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateHelpCategoryDto } from './create-help-category.dto';
export class UpdateHelpCategoryDto extends PartialType(CreateHelpCategoryDto) {}
```

`dto/create-help-article.dto.ts`:

```ts
import { IsArray, IsOptional, IsString, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateHelpArticleDto {
  @IsUUID() categoryId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(300) excerpt?: string;
  @IsString() body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) moduleKeys?: string[];
  @IsOptional() @IsInt() order?: number;
  /** Alleen SUPERUSER; ORG_ADMIN geforceerd op eigen org. */
  @IsOptional() @IsUUID() orgId?: string;
}
```

`dto/update-help-article.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateHelpArticleDto } from './create-help-article.dto';
export class UpdateHelpArticleDto extends PartialType(CreateHelpArticleDto) {}
```

`dto/list-help-articles.dto.ts`:

```ts
import { IsOptional, IsString, IsUUID, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { HelpArticleStatus } from '@prisma/client';

export class ListHelpArticlesDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(Object.values(HelpArticleStatus)) status?: HelpArticleStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
```

`dto/help-feedback.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';
export class HelpFeedbackDto {
  @IsBoolean() helpful!: boolean;
}
```

### A.2 Helpers — `src/modules/help/help.helpers.ts`

```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 200);
}
```

### A.3 Service — `src/modules/help/help.service.ts`

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, buildOrderBy, assertFound } from '@/common';
import { slugify } from './help.helpers';
import {
  CreateHelpArticleDto, UpdateHelpArticleDto, ListHelpArticlesDto,
  CreateHelpCategoryDto, UpdateHelpCategoryDto,
} from './dto';

const ARTICLE_SORT = ['title', 'order', 'viewCount', 'createdAt', 'updatedAt'];

@Injectable()
export class HelpService {
  constructor(private prisma: PrismaService) {}

  private isSuperuser(user: User) {
    return user.roles.includes(Role.SUPERUSER);
  }

  /** Zichtbaarheid: globaal (orgId null) OF eigen org. SUPERUSER ziet alles. */
  private visibilityWhere(user: User): Prisma.HelpArticleWhereInput {
    if (this.isSuperuser(user)) return {};
    return { OR: [{ orgId: null }, { orgId: user.orgId }] };
  }

  // ── Categorieën (lezen) ──────────────────────────────────────────────────
  async listCategories(user: User) {
    return this.prisma.helpCategory.findMany({
      where: {
        isPublished: true,
        ...(this.isSuperuser(user) ? {} : { OR: [{ orgId: null }, { orgId: user.orgId }] }),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async getCategoryBySlug(user: User, slug: string) {
    const category = assertFound(
      await this.prisma.helpCategory.findFirst({
        where: {
          slug,
          ...(this.isSuperuser(user) ? {} : { OR: [{ orgId: null }, { orgId: user.orgId }] }),
        },
      }),
      'Categorie',
    );
    const articles = await this.prisma.helpArticle.findMany({
      where: { categoryId: category.id, status: 'PUBLISHED', ...this.visibilityWhere(user) },
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
      page, limit,
    });
  }

  async getArticleBySlug(user: User, slug: string) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({
        where: { slug, status: 'PUBLISHED', ...this.visibilityWhere(user) },
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
      'Artikel',
    );
    // viewCount ophogen — fire-and-forget, blokkeert de respons niet
    this.prisma.helpArticle
      .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
    return article;
  }

  async giveFeedback(user: User, id: string, helpful: boolean) {
    const article = assertFound(
      await this.prisma.helpArticle.findFirst({ where: { id, ...this.visibilityWhere(user) } }),
      'Artikel',
    );
    return this.prisma.helpArticle.update({
      where: { id: article.id },
      data: helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } },
      select: { id: true, helpfulYes: true, helpfulNo: true },
    });
  }

  // ── Beheer: scope-resolutie ──────────────────────────────────────────────
  /** Bepaalt de orgId waaronder geschreven wordt + bewaakt schrijfrechten. */
  private resolveWriteOrgId(user: User, requestedOrgId?: string | null): string | null {
    if (this.isSuperuser(user)) return requestedOrgId ?? null;           // superuser: globaal of gekozen org
    // ORG_ADMIN mag alleen voor eigen org schrijven (nooit globaal)
    if (requestedOrgId && requestedOrgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten voor deze organisatie');
    }
    return user.orgId!;
  }

  private async assertCategoryInScope(user: User, categoryId: string, writeOrgId: string | null) {
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
    return this.prisma.helpCategory.create({
      data: {
        orgId,
        slug: dto.slug ?? slugify(dto.name),
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        order: dto.order ?? 0,
        parentId: dto.parentId,
      },
    });
  }

  async updateCategory(user: User, id: string, dto: UpdateHelpCategoryDto) {
    const cat = assertFound(await this.prisma.helpCategory.findUnique({ where: { id } }), 'Categorie');
    if (!this.isSuperuser(user) && cat.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op deze categorie'); // ORG_ADMIN kan globaal niet wijzigen
    }
    return this.prisma.helpCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  async deleteCategory(user: User, id: string) {
    const cat = assertFound(await this.prisma.helpCategory.findUnique({ where: { id } }), 'Categorie');
    if (!this.isSuperuser(user) && cat.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op deze categorie');
    }
    await this.prisma.helpCategory.delete({ where: { id } });
    return { id };
  }

  // ── Beheer: artikelen (incl. concepten in scope) ─────────────────────────
  async adminListArticles(user: User, q: ListHelpArticlesDto) {
    const { categoryId, search, status, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = q;
    const where: Prisma.HelpArticleWhereInput = {
      ...this.visibilityWhere(user),                 // SUPERUSER: alles; ORG_ADMIN: globaal + eigen org
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
    return paginate(this.prisma.helpArticle, {
      where,
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: buildOrderBy(sortBy, sortOrder, ARTICLE_SORT, { updatedAt: 'desc' }),
      page, limit,
    });
  }

  async createArticle(user: User, dto: CreateHelpArticleDto) {
    const orgId = this.resolveWriteOrgId(user, dto.orgId);
    await this.assertCategoryInScope(user, dto.categoryId, orgId);
    return this.prisma.helpArticle.create({
      data: {
        orgId,
        categoryId: dto.categoryId,
        slug: dto.slug ?? slugify(dto.title),
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
    const article = assertFound(await this.prisma.helpArticle.findUnique({ where: { id } }), 'Artikel');
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    if (dto.categoryId) await this.assertCategoryInScope(user, dto.categoryId, article.orgId);
    return this.prisma.helpArticle.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.moduleKeys !== undefined ? { moduleKeys: dto.moduleKeys } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async publishArticle(user: User, id: string) {
    const article = assertFound(await this.prisma.helpArticle.findUnique({ where: { id } }), 'Artikel');
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    return this.prisma.helpArticle.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: article.publishedAt ?? new Date() },
    });
  }

  async deleteArticle(user: User, id: string) {
    const article = assertFound(await this.prisma.helpArticle.findUnique({ where: { id } }), 'Artikel');
    if (!this.isSuperuser(user) && article.orgId !== user.orgId) {
      throw new ForbiddenException('Geen rechten op dit artikel');
    }
    await this.prisma.helpArticle.delete({ where: { id } });
    return { id };
  }
}
```

> `assertSameOrg` is hier vervangen door expliciete scope-checks omdat KB-rijen ook **globaal** (`orgId = null`) kunnen zijn — `assertSameOrg` gaat uit van een verplichte org.

### A.4 Read-controller — `src/modules/help/help.controller.ts`

```ts
import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { HelpService } from './help.service';
import { ListHelpArticlesDto, HelpFeedbackDto } from './dto';

@ApiTags('Help')
@ApiBearerAuth()
@Controller('help')
export class HelpController {
  constructor(private help: HelpService) {}

  @Get('categories')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Zichtbare KB-categorieën' })
  async categories(@CurrentUser() user: User) {
    return { success: true, data: await this.help.listCategories(user) };
  }

  @Get('categories/:slug')
  @Roles(...ALL_STAFF)
  async category(@CurrentUser() user: User, @Param('slug') slug: string) {
    return { success: true, data: await this.help.getCategoryBySlug(user, slug) };
  }

  @Get('articles')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Gepubliceerde artikelen (gefilterd op zichtbaarheid)' })
  async articles(@CurrentUser() user: User, @Query() q: ListHelpArticlesDto) {
    return { success: true, data: await this.help.listArticles(user, q) };
  }

  @Get('articles/:slug')
  @Roles(...ALL_STAFF)
  async article(@CurrentUser() user: User, @Param('slug') slug: string) {
    return { success: true, data: await this.help.getArticleBySlug(user, slug) };
  }

  @Post('articles/:id/feedback')
  @Roles(...ALL_STAFF)
  async feedback(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: HelpFeedbackDto) {
    return { success: true, data: await this.help.giveFeedback(user, id, dto.helpful) };
  }
}
```

### A.5 Admin-controller — `src/modules/help/help-admin.controller.ts`

```ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ORG_ADMINS } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { HelpService } from './help.service';
import {
  CreateHelpCategoryDto, UpdateHelpCategoryDto,
  CreateHelpArticleDto, UpdateHelpArticleDto, ListHelpArticlesDto,
} from './dto';

@ApiTags('Help (beheer)')
@ApiBearerAuth()
@Roles(...ORG_ADMINS)            // SUPERUSER (globaal) + ORG_ADMIN (eigen org)
@Controller('help/admin')
export class HelpAdminController {
  constructor(private help: HelpService) {}

  // Categorieën
  @Post('categories')
  async createCategory(@CurrentUser() user: User, @Body() dto: CreateHelpCategoryDto) {
    return { success: true, data: await this.help.createCategory(user, dto) };
  }
  @Patch('categories/:id')
  async updateCategory(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHelpCategoryDto) {
    return { success: true, data: await this.help.updateCategory(user, id, dto) };
  }
  @Delete('categories/:id')
  async deleteCategory(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.help.deleteCategory(user, id) };
  }

  // Artikelen
  @Get('articles')
  @ApiOperation({ summary: 'Artikelen incl. concepten (binnen scope)' })
  async listArticles(@CurrentUser() user: User, @Query() q: ListHelpArticlesDto) {
    return { success: true, data: await this.help.adminListArticles(user, q) };
  }
  @Post('articles')
  async createArticle(@CurrentUser() user: User, @Body() dto: CreateHelpArticleDto) {
    return { success: true, data: await this.help.createArticle(user, dto) };
  }
  @Patch('articles/:id')
  async updateArticle(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHelpArticleDto) {
    return { success: true, data: await this.help.updateArticle(user, id, dto) };
  }
  @Post('articles/:id/publish')
  async publishArticle(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.help.publishArticle(user, id) };
  }
  @Delete('articles/:id')
  async deleteArticle(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.help.deleteArticle(user, id) };
  }
}
```

> **Route-volgorde:** de read-controller `@Controller('help')` heeft `GET articles/:slug`; de admin-controller `@Controller('help/admin')` levert `GET help/admin/articles`. Die paden botsen niet (`help/admin/...` ≠ `help/articles/:slug`). Publieke detail gaat op **slug**, beheer op **id**.

### A.6 Module + registratie

`src/modules/help/help.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { HelpService } from './help.service';
import { HelpController } from './help.controller';
import { HelpAdminController } from './help-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HelpController, HelpAdminController],
  providers: [HelpService],
  exports: [HelpService],          // HelpService wordt in Fase 3 hergebruikt voor contextuele suggesties
})
export class HelpModule {}
```

Voeg `HelpModule` toe aan de `imports`-array in `src/app.module.ts` (bij de overige feature-modules, bv. naast `ErrorReportsModule`):

```ts
    HelpModule,
```

---

## B. Frontend

### B.1 Types — `src/types/index.ts`

```ts
export enum HelpArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface HelpCategory {
  id: string;
  orgId: string | null;        // null = globaal
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  parentId: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  articles?: HelpArticle[];    // bij categorie-detail
}

export interface HelpArticle {
  id: string;
  orgId: string | null;        // null = globaal
  categoryId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: HelpArticleStatus;
  tags: string[];
  moduleKeys: string[];
  order: number;
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  authorId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
}
```

> Hergebruik het bestaande `PaginatedResponse<T>` (`{ data, total, page, limit }`) uit `types/index.ts`.

### B.2 Status-map — `src/lib/status.ts`

```ts
export const HELP_ARTICLE_STATUS: StatusMap = {
  DRAFT:     { label: 'Concept',      classes: 'bg-gray-100 text-gray-700' },
  PUBLISHED: { label: 'Gepubliceerd', classes: 'bg-green-100 text-green-800' },
  ARCHIVED:  { label: 'Gearchiveerd', classes: 'bg-amber-100 text-amber-800' },
};
```

Gebruik: `<StatusBadge map={HELP_ARTICLE_STATUS} value={article.status} />`.

### B.3 Hooks — `src/pages/help/hooks/use-help.ts`

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { HelpArticle, HelpCategory, HelpArticleStatus, PaginatedResponse } from '@/types';

// ── Lezen ──────────────────────────────────────────────────────────────────
export function useHelpCategories() {
  return useQuery<HelpCategory[]>({
    queryKey: ['help', 'categories'],
    queryFn: () => apiClient.get<HelpCategory[]>('/help/categories'),
  });
}

export function useHelpCategory(slug: string) {
  return useQuery<HelpCategory>({
    queryKey: ['help', 'category', slug],
    queryFn: () => apiClient.get<HelpCategory>(`/help/categories/${slug}`),
    enabled: !!slug,
  });
}

interface ArticleListParams { categoryId?: string; search?: string; status?: HelpArticleStatus; page?: number; limit?: number; }

function toQuery(p: ArticleListParams): string {
  const q = new URLSearchParams();
  if (p.categoryId) q.set('categoryId', p.categoryId);
  if (p.search) q.set('search', p.search);
  if (p.status) q.set('status', p.status);
  if (p.page) q.set('page', String(p.page));
  if (p.limit) q.set('limit', String(p.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function useHelpArticles(params: ArticleListParams = {}) {
  return useQuery<PaginatedResponse<HelpArticle>>({
    queryKey: ['help', 'articles', params],
    queryFn: () => apiClient.get<PaginatedResponse<HelpArticle>>(`/help/articles${toQuery(params)}`),
  });
}

export function useHelpArticle(slug: string) {
  return useQuery<HelpArticle>({
    queryKey: ['help', 'article', slug],
    queryFn: () => apiClient.get<HelpArticle>(`/help/articles/${slug}`),
    enabled: !!slug,
  });
}

// ── Beheer ─────────────────────────────────────────────────────────────────
export function useAdminHelpArticles(params: ArticleListParams = {}) {
  return useQuery<PaginatedResponse<HelpArticle>>({
    queryKey: ['help', 'admin', 'articles', params],
    queryFn: () => apiClient.get<PaginatedResponse<HelpArticle>>(`/help/admin/articles${toQuery(params)}`),
  });
}

export function useCreateHelpArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HelpArticle>) => apiClient.post<HelpArticle>('/help/admin/articles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help'] }),
  });
}

export function useUpdateHelpArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HelpArticle> }) =>
      apiClient.patch<HelpArticle>(`/help/admin/articles/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help'] }),
  });
}

export function usePublishHelpArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<HelpArticle>(`/help/admin/articles/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help'] }),
  });
}

export function useDeleteHelpArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/help/admin/articles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help'] }),
  });
}

export function useCreateHelpCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HelpCategory>) => apiClient.post<HelpCategory>('/help/admin/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help'] }),
  });
}
```

### B.4 Pagina's

> De skeletten gebruiken bestaande, gedocumenteerde componenten (`PageHeader`, `DetailPageLayout`, `Tabs`, `StatusBadge`, `ErrorBox`, `Spinner`, `useConfirm`, `AuditHistory`). De markdown-`body` renderen we met een **sanitized** markdown-renderer — voeg `react-markdown` + `rehype-sanitize` toe (`pnpm --filter portal add react-markdown rehype-sanitize`) of hergebruik een bestaande renderer als die er al is.

`src/pages/help/help-center-page.tsx` (`/help`):

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Input, Spinner, ErrorBox } from '@/components/ui';
import { useHelpCategories, useHelpArticles } from './hooks/use-help';

export default function HelpCenterPage() {
  const [search, setSearch] = useState('');
  const { data: categories, isLoading, error } = useHelpCategories();
  const { data: results } = useHelpArticles({ search: search || undefined, limit: 10 });

  if (isLoading) return <Spinner size="lg" />;
  if (error) return <ErrorBox>Kon het helpcentrum niet laden.</ErrorBox>;

  return (
    <div className="space-y-6">
      <PageHeader title="Helpcentrum" description="Doorzoek artikelen of blader per categorie." />

      <Input placeholder="Zoek in de helpartikelen…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {search && results && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Zoekresultaten</h3>
          <ul className="divide-y">
            {results.data.map((a) => (
              <li key={a.id} className="py-2">
                <Link to={`/help/article/${a.slug}`} className="font-medium text-primary-600 hover:underline">{a.title}</Link>
                {a.excerpt && <p className="text-sm text-gray-600">{a.excerpt}</p>}
              </li>
            ))}
            {results.data.length === 0 && <li className="py-2 text-sm text-gray-500">Geen resultaten — probeer andere woorden of maak een ticket aan.</li>}
          </ul>
        </Card>
      )}

      {!search && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories?.map((c) => (
            <Link key={c.id} to={`/help/category/${c.slug}`}>
              <Card className="h-full transition hover:shadow-md">
                <h3 className="font-semibold text-gray-900">{c.name}</h3>
                {c.description && <p className="mt-1 text-sm text-gray-600">{c.description}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

`src/pages/help/help-article-page.tsx` (`/help/article/:slug`):

```tsx
import { useParams, Link } from 'react-router-dom';
import { Spinner, ErrorBox, Button } from '@/components/ui';
import { useHelpArticle } from './hooks/use-help';
// import ReactMarkdown from 'react-markdown'; import rehypeSanitize from 'rehype-sanitize';

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, error } = useHelpArticle(slug!);

  if (isLoading) return <Spinner size="lg" />;
  if (error || !article) return <ErrorBox>Artikel niet gevonden.</ErrorBox>;

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link to="/help" className="text-sm text-gray-500 hover:underline">← Terug naar helpcentrum</Link>
      <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
      <div className="prose max-w-none">
        {/* <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{article.body}</ReactMarkdown> */}
        <pre className="whitespace-pre-wrap font-sans">{article.body}</pre>
      </div>
      <div className="flex items-center gap-3 border-t pt-4">
        <span className="text-sm text-gray-500">Was dit nuttig?</span>
        <Button variant="secondary" size="sm">Ja</Button>
        <Button variant="secondary" size="sm">Nee</Button>
        {/* koppel aan POST /help/articles/:id/feedback */}
      </div>
    </article>
  );
}
```

`src/pages/help/help-admin-page.tsx` (`/help/admin` — in-component rol-guard):

```tsx
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Button, StatusBadge, Spinner, ErrorBox, useConfirm } from '@/components/ui';
import { HELP_ARTICLE_STATUS } from '@/lib/status';
import {
  useAdminHelpArticles, usePublishHelpArticle, useDeleteHelpArticle,
} from './hooks/use-help';

const ADMIN_ROLES = ['SUPERUSER', 'ORG_ADMIN'];

export default function HelpAdminPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const canManage = user?.roles?.some((r) => ADMIN_ROLES.includes(r));
  const { data, isLoading, error } = useAdminHelpArticles({ limit: 50 });
  const publish = usePublishHelpArticle();
  const remove = useDeleteHelpArticle();

  if (!canManage) return <ErrorBox>Je hebt geen toegang tot KB-beheer.</ErrorBox>;
  if (isLoading) return <Spinner size="lg" />;
  if (error) return <ErrorBox>Kon artikelen niet laden.</ErrorBox>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge base — beheer"
        description="Schrijf en publiceer helpartikelen."
        actions={<Button>Nieuw artikel</Button>}   /* → editor-modal/route (volgende stap) */
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Titel</th><th>Scope</th><th>Status</th><th>Weergaven</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2 font-medium">{a.title}</td>
                <td>{a.orgId ? 'Org-specifiek' : 'Globaal'}</td>
                <td><StatusBadge map={HELP_ARTICLE_STATUS} value={a.status} /></td>
                <td>{a.viewCount}</td>
                <td className="space-x-2 text-right">
                  {a.status !== 'PUBLISHED' && (
                    <Button size="sm" variant="secondary" onClick={() => publish.mutate(a.id)}>Publiceren</Button>
                  )}
                  <Button size="sm" variant="danger" onClick={async () => {
                    if (await confirm({ title: 'Verwijderen?', message: `"${a.title}" verwijderen?`, confirmLabel: 'Verwijderen' }))
                      remove.mutate(a.id);
                  }}>Verwijderen</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

> De "Nieuw artikel"/bewerk-editor (titel, categorie, scope, body-markdown, tags, moduleKeys) is een volgende stap binnen Fase 2 — bouw als modal of sub-route met `useCreateHelpArticle()`/`useUpdateHelpArticle()`. Optioneel later upgraden naar `DetailPageLayout` + `TableConfigSidebar` zoals de andere overzichtspagina's; bovenstaande simpele tabel houdt de scaffold compileerbaar.

### B.5 Routing — `src/App.tsx`

Lazy imports (bij de overige):

```tsx
const HelpCenterPage  = lazy(() => import('@/pages/help/help-center-page'));
const HelpArticlePage = lazy(() => import('@/pages/help/help-article-page'));
const HelpAdminPage   = lazy(() => import('@/pages/help/help-admin-page'));
```

Routes binnen `<Route element={<AppLayout />}>`:

```tsx
<Route path="/help" element={<HelpCenterPage />} />
<Route path="/help/category/:slug" element={<HelpCenterPage />} />
<Route path="/help/article/:slug" element={<HelpArticlePage />} />
<Route path="/help/admin" element={<HelpAdminPage />} />
```

> `/help/admin` heeft een in-component rol-guard (B.4). Bestaat er in jullie codebase wél een `RoleProtectedRoute`-wrapper, gebruik die dan i.p.v. de in-component check.

### B.6 Sidebar — `src/components/layout/sidebar.tsx`

Voeg een nav-item toe aan `mainSections` (zichtbaar voor iedereen); KB-beheer als child alleen voor admins (gebruik de bestaande `adminRoles`-constante in dit bestand):

```tsx
{
  to: '/help',
  label: 'Help & support',
  icon: (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  children: [
    { to: '/help', label: 'Helpcentrum' },
    // tickets volgen in Fase 4: { to: '/help/tickets', label: 'Mijn tickets' },
  ],
},
```

Voeg KB-beheer toe in `organisatieSections` met `roles: adminRoles` → `{ to: '/help/admin', label: 'Knowledge base' }`.

---

## C. Verificatie & Definition of Done

```bash
# backend
cd apps/api
pnpm test                       # help.service unit (voeg help.service.spec.ts toe)
pnpm test:e2e -- help           # zichtbaarheid: niet-superuser ziet alleen PUBLISHED + globaal/eigen org

# volledige build (root)
npx turbo run build             # TypeScript groen (api + portal)
```

**Smoketests (browser):**
1. SUPERUSER op `mijn.localhost:5173` → `/help/admin` → maak globaal artikel + publiceer → zichtbaar op `inspexidemo.localhost:5173/help`.
2. ORG_ADMIN op `inspexidemo.localhost:5173` → `/help/admin` → maak org-artikel → zichtbaar binnen demo-org, **niet** in een andere org.
3. INSPECTEUR → `/help` werkt; `/help/admin` toont "geen toegang".
4. Zoeken op `/help` geeft resultaten; onbekende term → vriendelijke "geen resultaten + maak ticket".

**Klaar wanneer:**

- [ ] `HelpModule` geregistreerd; `/api/docs` toont de Help-endpoints.
- [ ] Lees-endpoints filteren `org_id IS NULL OR = userOrgId` én `status = PUBLISHED`; e2e dekt cross-org-isolatie (org A ziet org B's org-artikel niet).
- [ ] ORG_ADMIN kan globale rijen niet wijzigen/verwijderen (403); SUPERUSER wel.
- [ ] `/help`, `/help/article/:slug`, `/help/admin` werken; markdown wordt sanitized gerenderd.
- [ ] Sidebar toont "Help & support" voor iedereen, "Knowledge base" alleen voor admins.
- [ ] `npx turbo run build` groen.

**Commit:** `feat: implement IMP_PRD-10 — fase 2 knowledge base (backend + lees-UI + beheer)`

> Volgende stap (Fase 3): zwevend help-paneel + contextuele suggesties (`GET /help/articles/contextual`, `moduleKeys` + `pg_trgm`) + chat-placeholder. Zie `IMP_PRD_10_Helpsysteem.md` §7–§9.
