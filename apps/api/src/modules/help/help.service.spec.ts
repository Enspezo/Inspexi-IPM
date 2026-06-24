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
  });
});
