import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { HelpService } from './help.service';
import { PrismaService } from '@/prisma';

describe('HelpService', () => {
  let service: HelpService;

  const mockPrisma = {
    helpArticle: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    helpCategory: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };

  const superuser = {
    id: 'su',
    roles: [Role.SUPERUSER],
    orgId: null,
  } as unknown as User;
  const orgAdmin = {
    id: 'oa',
    roles: [Role.ORG_ADMIN],
    orgId: 'orgA',
  } as unknown as User;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HelpService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<HelpService>(HelpService);
  });

  describe('zichtbaarheid', () => {
    it('niet-superuser ziet alleen globaal + eigen-org PUBLISHED', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValue([]);
      mockPrisma.helpArticle.count.mockResolvedValue(0);
      await service.listArticles(orgAdmin, {});
      const arg = mockPrisma.helpArticle.findMany.mock.calls[0][0];
      expect(arg.where.status).toBe('PUBLISHED');
      expect(arg.where.OR).toEqual([{ orgId: null }, { orgId: 'orgA' }]);
    });

    it('superuser ziet alles (geen org-OR-filter)', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValue([]);
      mockPrisma.helpArticle.count.mockResolvedValue(0);
      await service.listArticles(superuser, {});
      const arg = mockPrisma.helpArticle.findMany.mock.calls[0][0];
      expect(arg.where.OR).toBeUndefined();
      expect(arg.where.status).toBe('PUBLISHED');
    });
  });

  describe('getArticleBySlug', () => {
    it('gooit NotFound als niet zichtbaar', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValue(null);
      await expect(service.getArticleBySlug(orgAdmin, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('hoogt viewCount op via raw SQL (audit-bypass)', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValue({ id: 'a1' });
      mockPrisma.$executeRaw.mockResolvedValue(1);
      await service.getArticleBySlug(orgAdmin, 'x');
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockPrisma.helpArticle.update).not.toHaveBeenCalled();
    });

    it('leest met org-voorrang (org wint van globaal; superuser → globaal eerst)', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValue({ id: 'a1' });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.getArticleBySlug(orgAdmin, 'x');
      expect(mockPrisma.helpArticle.findFirst.mock.calls[0][0].orderBy).toEqual({
        orgId: { sort: 'desc', nulls: 'last' },
      });

      mockPrisma.helpArticle.findFirst.mockClear();
      await service.getArticleBySlug(superuser, 'x');
      expect(mockPrisma.helpArticle.findFirst.mock.calls[0][0].orderBy).toEqual({
        orgId: { sort: 'asc', nulls: 'first' },
      });
    });
  });

  describe('scope-enforcement', () => {
    it('ORG_ADMIN mag niet voor een andere org schrijven (403)', async () => {
      await expect(
        service.createArticle(orgAdmin, {
          categoryId: 'c1',
          title: 'T',
          body: 'B',
          orgId: 'orgB',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ORG_ADMIN-create zonder orgId schrijft onder eigen org', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
        audience: 'INTERNAL',
      });
      mockPrisma.helpArticle.findFirst.mockResolvedValue(null);
      mockPrisma.helpArticle.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new', ...data }),
      );
      const res = await service.createArticle(orgAdmin, {
        categoryId: 'c1',
        title: 'Aan de slag',
        body: 'B',
      } as never);
      expect(res.orgId).toBe('orgA');
      expect(res.slug).toBe('aan-de-slag');
      expect(res.status).toBe('DRAFT');
      expect(res.authorId).toBe('oa');
    });

    it('SUPERUSER-create zonder orgId schrijft globaal (null)', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
        audience: 'INTERNAL',
      });
      mockPrisma.helpArticle.findFirst.mockResolvedValue(null);
      mockPrisma.helpArticle.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new', ...data }),
      );
      const res = await service.createArticle(superuser, {
        categoryId: 'c1',
        title: 'T',
        body: 'B',
      } as never);
      expect(res.orgId).toBeNull();
    });

    it('ORG_ADMIN kan globaal artikel niet wijzigen (403)', async () => {
      mockPrisma.helpArticle.findUnique.mockResolvedValue({
        id: 'a1',
        orgId: null,
        slug: 's',
      });
      await expect(
        service.updateArticle(orgAdmin, 'a1', { title: 'x' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ORG_ADMIN kan globaal artikel niet verwijderen (403)', async () => {
      mockPrisma.helpArticle.findUnique.mockResolvedValue({
        id: 'a1',
        orgId: null,
      });
      await expect(service.deleteArticle(orgAdmin, 'a1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('SUPERUSER kan globaal artikel publiceren', async () => {
      mockPrisma.helpArticle.findUnique.mockResolvedValue({
        id: 'a1',
        orgId: null,
        publishedAt: null,
      });
      mockPrisma.helpArticle.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'a1', ...data }),
      );
      const res = await service.publishArticle(superuser, 'a1');
      expect(res.status).toBe('PUBLISHED');
      expect(res.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('slug-uniciteit', () => {
    it('suffixt de slug bij botsing binnen scope', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
        audience: 'INTERNAL',
      });
      mockPrisma.helpArticle.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // 'aan-de-slag' bezet
        .mockResolvedValueOnce(null); // 'aan-de-slag-2' vrij
      mockPrisma.helpArticle.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new', ...data }),
      );
      const res = await service.createArticle(superuser, {
        categoryId: 'c1',
        title: 'Aan de slag',
        body: 'B',
      } as never);
      expect(res.slug).toBe('aan-de-slag-2');
    });
  });

  describe('externe KB (audience)', () => {
    it('extern artikel onder externe categorie: orgId geforceerd, moduleKeys leeg', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'ext',
        orgId: 'orgA',
        audience: 'EXTERNAL',
      });
      mockPrisma.helpArticle.findFirst.mockResolvedValue(null);
      mockPrisma.helpArticle.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new', ...data }),
      );
      const res = await service.createArticle(orgAdmin, {
        categoryId: 'ext',
        title: 'Publiek',
        body: 'B',
        audience: 'EXTERNAL',
        moduleKeys: ['quotes'], // moet genegeerd worden voor extern
      } as never);
      expect(res.orgId).toBe('orgA');
      expect(res.audience).toBe('EXTERNAL');
      expect(res.moduleKeys).toEqual([]);
    });

    it('extern artikel onder interne categorie → BadRequest', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: 'orgA',
        audience: 'INTERNAL',
      });
      await expect(
        service.createArticle(orgAdmin, {
          categoryId: 'c1',
          title: 'T',
          body: 'B',
          audience: 'EXTERNAL',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('SUPERUSER (zonder org) kan geen extern artikel maken → BadRequest', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'ext',
        orgId: null,
        audience: 'EXTERNAL',
      });
      await expect(
        service.createArticle(superuser, {
          categoryId: 'ext',
          title: 'T',
          body: 'B',
          audience: 'EXTERNAL',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('giveFeedback', () => {
    it('hoogt helpful_yes op via raw SQL en geeft tellers terug', async () => {
      mockPrisma.helpArticle.findFirst.mockResolvedValue({ id: 'a1' });
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.helpArticle.findUnique.mockResolvedValue({
        id: 'a1',
        helpfulYes: 1,
        helpfulNo: 0,
      });
      const res = await service.giveFeedback(orgAdmin, 'a1', true);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(res).toEqual({ id: 'a1', helpfulYes: 1, helpfulNo: 0 });
    });
  });

  describe('getContextual (Fase 3)', () => {
    it('moduleKey-match: primaire query filtert op moduleKeys + zichtbaarheid + PUBLISHED', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([
        { id: 'a1', orgId: null, viewCount: 0, order: 0 },
      ]);
      const res = await service.getContextual(orgAdmin, 'quotes');

      // geen fallback nodig → exact één query
      expect(mockPrisma.helpArticle.findMany).toHaveBeenCalledTimes(1);
      const args = mockPrisma.helpArticle.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('PUBLISHED');
      expect(args.where.OR).toEqual([{ orgId: null }, { orgId: 'orgA' }]);
      expect(args.where.moduleKeys).toEqual({ hasSome: ['quotes'] });
      // deterministische afkapping
      expect(args.orderBy).toEqual([{ viewCount: 'desc' }, { order: 'asc' }]);
      expect(res.items).toHaveLength(1);
    });

    it('superuser: geen org-OR-filter in de contextuele query', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([
        { id: 'a1', orgId: null, viewCount: 0, order: 0 },
      ]);
      await service.getContextual(superuser, 'quotes');
      const args = mockPrisma.helpArticle.findMany.mock.calls[0][0];
      expect(args.where.OR).toBeUndefined();
      expect(args.where.status).toBe('PUBLISHED');
    });

    it('vrije zoekterm behoudt de zichtbaarheids-OR (geen cross-tenant lek)', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([
        { id: 'a1', orgId: 'orgA', viewCount: 0, order: 0 },
      ]);
      await service.getContextual(orgAdmin, 'quotes', 'pdf');
      const where = mockPrisma.helpArticle.findMany.mock.calls[0][0].where;

      // Zichtbaarheidsfilter mag NIET overschreven worden door de tekst-OR.
      expect(where.OR).toEqual([{ orgId: null }, { orgId: 'orgA' }]);
      // Tekstmatch wordt ge-AND naast de visibility-OR.
      expect(Array.isArray(where.AND)).toBe(true);
      expect(where.AND[0].OR).toEqual([
        { title: { contains: 'pdf', mode: 'insensitive' } },
        { excerpt: { contains: 'pdf', mode: 'insensitive' } },
        { tags: { hasSome: ['pdf'] } },
      ]);
    });

    it('fallback bij geen treffers: tweede query op meest-bekeken binnen scope', async () => {
      mockPrisma.helpArticle.findMany
        .mockResolvedValueOnce([]) // primair: niets
        .mockResolvedValueOnce([{ id: 'f1', orgId: null, viewCount: 10, order: 0 }]);

      const res = await service.getContextual(orgAdmin, 'quotes');

      expect(mockPrisma.helpArticle.findMany).toHaveBeenCalledTimes(2);
      const fb = mockPrisma.helpArticle.findMany.mock.calls[1][0];
      expect(fb.where.status).toBe('PUBLISHED');
      expect(fb.where.OR).toEqual([{ orgId: null }, { orgId: 'orgA' }]);
      expect(fb.where.moduleKeys).toBeUndefined(); // fallback negeert de module
      expect(fb.orderBy).toEqual([{ viewCount: 'desc' }, { order: 'asc' }]);
      expect(res.items).toHaveLength(1);
      expect((res.items[0] as { id: string }).id).toBe('f1');
    });

    it('geen fallback bij actief zoeken zonder treffers (lege lijst)', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([]); // primair: niets
      const res = await service.getContextual(
        orgAdmin,
        'quotes',
        'zoektermzondertreffer',
      );
      // bij een actieve zoekterm volgt GEEN fallback → exact één query, lege lijst
      expect(mockPrisma.helpArticle.findMany).toHaveBeenCalledTimes(1);
      expect(res.items).toHaveLength(0);
    });

    it('org-voorrang: eigen-org artikel vóór globaal, daarna viewCount', async () => {
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce([
        { id: 'global-pop', orgId: null, viewCount: 99, order: 0 },
        { id: 'org-art', orgId: 'orgA', viewCount: 1, order: 5 },
      ]);
      const res = await service.getContextual(orgAdmin, 'quotes');
      expect((res.items as { id: string }[]).map((i) => i.id)).toEqual([
        'org-art',
        'global-pop',
      ]);
    });

    it('respecteert de limit (slice)', async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        id: `a${i}`,
        orgId: null,
        viewCount: 8 - i,
        order: i,
      }));
      mockPrisma.helpArticle.findMany.mockResolvedValueOnce(many);
      const res = await service.getContextual(orgAdmin, 'quotes', undefined, 3);
      expect(res.items).toHaveLength(3);
    });
  });

  describe('createCategory', () => {
    beforeEach(() => {
      mockPrisma.helpCategory.findFirst.mockResolvedValue(null); // slug vrij
      mockPrisma.helpCategory.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'newcat', ...data }),
      );
    });

    it('ORG_ADMIN zonder orgId schrijft onder eigen org', async () => {
      const res = await service.createCategory(orgAdmin, {
        name: 'Org Handleiding',
      } as never);
      expect(res.orgId).toBe('orgA');
      expect(res.slug).toBe('org-handleiding');
    });

    it('SUPERUSER zonder orgId schrijft globaal (null)', async () => {
      const res = await service.createCategory(superuser, {
        name: 'Globale categorie',
      } as never);
      expect(res.orgId).toBeNull();
    });

    it('ORG_ADMIN mag geen categorie voor een andere org maken (403)', async () => {
      await expect(
        service.createCategory(orgAdmin, { name: 'X', orgId: 'orgB' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateCategory', () => {
    it('ORG_ADMIN kan een globale categorie niet wijzigen (403)', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
        slug: 's',
      });
      await expect(
        service.updateCategory(orgAdmin, 'c1', { name: 'x' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SUPERUSER kan een globale categorie wel wijzigen', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
        slug: 's',
      });
      mockPrisma.helpCategory.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'c1', ...data }),
      );
      const res = await service.updateCategory(superuser, 'c1', {
        name: 'Nieuwe naam',
      } as never);
      expect(res.name).toBe('Nieuwe naam');
    });
  });

  describe('deleteCategory', () => {
    it('weigert een niet-lege categorie te verwijderen', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
      });
      mockPrisma.helpArticle.count.mockResolvedValue(2);
      mockPrisma.helpCategory.count.mockResolvedValue(0);
      await expect(service.deleteCategory(superuser, 'c1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('verwijdert een lege categorie', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
      });
      mockPrisma.helpArticle.count.mockResolvedValue(0);
      mockPrisma.helpCategory.count.mockResolvedValue(0);
      mockPrisma.helpCategory.delete.mockResolvedValue({ id: 'c1' });
      const res = await service.deleteCategory(superuser, 'c1');
      expect(res).toEqual({ id: 'c1' });
      expect(mockPrisma.helpCategory.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('ORG_ADMIN kan een globale categorie niet verwijderen (403)', async () => {
      mockPrisma.helpCategory.findUnique.mockResolvedValue({
        id: 'c1',
        orgId: null,
      });
      await expect(service.deleteCategory(orgAdmin, 'c1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
