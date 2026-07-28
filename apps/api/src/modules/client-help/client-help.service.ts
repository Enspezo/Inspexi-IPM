import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';

/**
 * Externe kennisbank voor het klantportaal. Toont uitsluitend EXTERNAL,
 * gepubliceerde artikelen van de org uit het subdomein (@CurrentTenant).
 * - Publiek (zonder login): alleen categorieën met isPublic = true.
 * - Ingelogd (ClientUser): alle externe categorieën van de org (publiek + afgeschermd).
 */
@Injectable()
export class ClientHelpService {
  constructor(private prisma: PrismaService) {}

  /** Categorie-selectie met geneste, gepubliceerde externe artikelen (zonder body). */
  private categoryInclude(): Prisma.HelpCategoryInclude {
    return {
      articles: {
        where: { status: 'PUBLISHED', audience: 'EXTERNAL' },
        orderBy: [{ order: 'asc' }, { title: 'asc' }],
        select: { id: true, slug: true, title: true, excerpt: true, order: true },
      },
    };
  }

  /** Atomische viewCount-bump buiten de audit-middleware om (zoals HelpService). */
  private bumpViewCount(id: string) {
    return this.prisma.$executeRaw(
      Prisma.sql`UPDATE imp_help_articles SET view_count = view_count + 1 WHERE id = ${id}::uuid`,
    );
  }

  async listCategories(orgId: string | null, publicOnly: boolean) {
    if (!orgId) return [];
    return this.prisma.helpCategory.findMany({
      where: {
        orgId,
        audience: 'EXTERNAL',
        isPublished: true,
        ...(publicOnly ? { isPublic: true } : {}),
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: this.categoryInclude(),
    });
  }

  async getArticleBySlug(orgId: string | null, slug: string, publicOnly: boolean) {
    const article = assertFound(
      orgId
        ? await this.prisma.helpArticle.findFirst({
            where: {
              orgId,
              slug,
              audience: 'EXTERNAL',
              status: 'PUBLISHED',
              // Publiek: het artikel moet onder een publieke categorie hangen.
              ...(publicOnly ? { category: { isPublic: true } } : {}),
            },
            include: { category: { select: { id: true, name: true, slug: true } } },
          })
        : null,
      'Artikel',
    );
    // Fire-and-forget viewCount-bump (audit-bypass).
    this.bumpViewCount(article.id).catch(() => undefined);
    return article;
  }
}
