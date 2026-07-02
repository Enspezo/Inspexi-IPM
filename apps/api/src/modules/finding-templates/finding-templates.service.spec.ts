import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FindingTemplatesService } from './finding-templates.service';
import { PrismaService } from '@/prisma';

describe('FindingTemplatesService', () => {
  let service: FindingTemplatesService;

  const mockPrismaService = {
    findingTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    classificationModel: {
      findUnique: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FindingTemplatesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FindingTemplatesService>(FindingTemplatesService);
  });

  describe('findAll', () => {
    it('should scope an org user to own org + system templates', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.findingTemplate.count.mockResolvedValue(0);

      const result = await service.findAll(mockUser, {});

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      const call = mockPrismaService.findingTemplate.findMany.mock.calls[0][0];
      // AND[1] is the org-scope OR clause
      expect(call.where.AND[1]).toEqual({
        OR: [{ orgId: 'org-1' }, { orgId: null, isSystem: true }],
      });
      // Active filter on by default
      expect(call.where.AND[0]).toEqual({ isActive: true });
    });

    it('should not org-scope for SUPERUSER', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.findingTemplate.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, {});

      const call = mockPrismaService.findingTemplate.findMany.mock.calls[0][0];
      expect(call.where.AND[1]).toEqual({});
    });
  });

  describe('findAllActive', () => {
    it('should return active org + system templates without a pagination envelope', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([{ id: 't-1' }]);

      const result = await service.findAllActive(mockUser);

      // Flat array, not the { data, total, page, limit } shape
      expect(result).toEqual([{ id: 't-1' }]);
      expect(mockPrismaService.findingTemplate.count).not.toHaveBeenCalled();

      const call = mockPrismaService.findingTemplate.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ isActive: true });
      expect(call.where.AND[1]).toEqual({
        OR: [{ orgId: 'org-1' }, { orgId: null, isSystem: true }],
      });
    });

    it('should not org-scope for SUPERUSER but still filter on active', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([]);

      await service.findAllActive(mockSuperuser);

      const call = mockPrismaService.findingTemplate.findMany.mock.calls[0][0];
      expect(call.where.AND[0]).toEqual({ isActive: true });
      expect(call.where.AND[1]).toEqual({});
    });
  });

  describe('getUsedCategories', () => {
    it('should return distinct, sorted, non-null categories', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([
        { category: { id: 'c2', name: 'Beta', color: null, icon: null } },
        { category: null },
        { category: { id: 'c1', name: 'Alpha', color: null, icon: null } },
      ]);

      const result = await service.getUsedCategories(mockUser);

      expect(result.map((c) => c.name)).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('findById', () => {
    it('should return the template when found', async () => {
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue({ id: 't-1' });

      const result = await service.findById('t-1', mockUser);

      expect(result.id).toBe('t-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Constateringssjabloon niet gevonden'),
      );
    });
  });

  describe('create — FK validation', () => {
    const baseDto = {
      shortDescription: 'Kabel beschadigd',
      classificationModelId: 'model-1',
      defaultClassification: {},
    } as any;

    it('should create an org template with a SYSTEM category (allowed)', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [],
      });
      // System category → orgId null
      mockPrismaService.category.findUnique.mockResolvedValue({ orgId: null });
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.findingTemplate.create.mockResolvedValue({ id: 'new-1' });

      const result = await service.create(mockUser, {
        ...baseDto,
        categoryId: 'cat-sys',
        code: 'FT-1',
      });

      expect(result.id).toBe('new-1');
      const data = mockPrismaService.findingTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.createdBy).toBe('user-1');
    });

    it('should allow an OWN-ORG category', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [],
      });
      mockPrismaService.category.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.findingTemplate.create.mockResolvedValue({ id: 'new-2' });

      const result = await service.create(mockUser, { ...baseDto, categoryId: 'cat-own' });

      expect(result.id).toBe('new-2');
    });

    it('should reject a FOREIGN-ORG category with 403', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [],
      });
      mockPrismaService.category.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create(mockUser, { ...baseDto, categoryId: 'cat-foreign' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.findingTemplate.create).not.toHaveBeenCalled();
    });

    it('should reject when the classification model does not exist', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue(null);

      await expect(service.create(mockUser, baseDto)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.findingTemplate.create).not.toHaveBeenCalled();
    });

    it('should reject invalid defaultClassification keys', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [{ code: 'severity' }],
      });

      await expect(
        service.create(mockUser, {
          ...baseDto,
          defaultClassification: { bogus: 'x' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [],
      });
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(mockUser, { ...baseDto, code: 'DUP' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a SYSTEM template for SUPERUSER', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({
        id: 'model-1',
        characteristics: [],
      });
      mockPrismaService.findingTemplate.create.mockResolvedValue({ id: 'sys-new' });

      await service.create(mockSuperuser, baseDto);

      const data = mockPrismaService.findingTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
    });
  });

  describe('update / assertManageable', () => {
    it('should block an org-admin from editing a system row', async () => {
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue({
        id: 'sys-1',
        orgId: null,
        isSystem: true,
      });

      await expect(
        service.update('sys-1', mockUser, { shortDescription: 'Hack' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.findingTemplate.update).not.toHaveBeenCalled();
    });

    it('should allow an org-admin to edit its own row', async () => {
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue({
        id: 'org-t-1',
        orgId: 'org-1',
        isSystem: false,
        classificationModelId: 'model-1',
      });
      mockPrismaService.findingTemplate.update.mockResolvedValue({
        id: 'org-t-1',
        shortDescription: 'Nieuw',
      });

      const result = await service.update('org-t-1', mockUser, { shortDescription: 'Nieuw' });

      expect(result.shortDescription).toBe('Nieuw');
    });
  });

  describe('duplicate', () => {
    it('should require an organization', async () => {
      await expect(service.duplicate('t-1', mockSuperuser)).rejects.toThrow(ForbiddenException);
    });

    it('should fork a system template into the org with -COPY code', async () => {
      mockPrismaService.findingTemplate.findFirst
        .mockResolvedValueOnce({
          id: 't-1',
          orgId: null,
          isSystem: true,
          code: 'FT-1',
          shortDescription: 'Kabel',
          classificationModelId: 'model-1',
          defaultClassification: {},
        })
        // duplicate-code lookup for 'FT-1-COPY'
        .mockResolvedValueOnce(null);
      mockPrismaService.findingTemplate.create.mockResolvedValue({ id: 'fork-1' });

      const result = await service.duplicate('t-1', mockUser);

      expect(result.id).toBe('fork-1');
      const data = mockPrismaService.findingTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.code).toBe('FT-1-COPY');
    });
  });

  describe('export', () => {
    it('should produce the export envelope shape', async () => {
      mockPrismaService.findingTemplate.findMany.mockResolvedValue([
        {
          code: 'FT-1',
          shortDescription: 'Kabel',
          longDescription: null,
          explanation: null,
          normReference: null,
          category: { name: 'Elektra' },
          classificationModel: { code: 'NEN3140' },
          defaultClassification: { severity: 'high' },
        },
      ]);

      const result = await service.export(mockUser, undefined);

      expect(result.exportVersion).toBe('1.0');
      expect(result.exportedBy).toBe('admin@test.nl');
      expect(result.findingTemplates).toHaveLength(1);
      expect(result.findingTemplates[0]).toMatchObject({
        code: 'FT-1',
        category: 'Elektra',
        classificationModelCode: 'NEN3140',
        defaultClassification: { severity: 'high' },
      });
    });
  });

  describe('import', () => {
    it('should require an organization', async () => {
      await expect(
        service.import(mockSuperuser, { exportVersion: '1.0', findingTemplates: [] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should skip rows with an unknown classification model and import the rest', async () => {
      mockPrismaService.classificationModel.findUnique
        .mockResolvedValueOnce(null) // first row: unknown model
        .mockResolvedValueOnce({ id: 'model-1' }); // second row: known
      mockPrismaService.findingTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      mockPrismaService.findingTemplate.create.mockResolvedValue({ id: 'imp-1' });

      const result = await service.import(mockUser, {
        exportVersion: '1.0',
        findingTemplates: [
          {
            shortDescription: 'Onbekend model',
            classificationModelCode: 'NOPE',
          },
          {
            shortDescription: 'Geldig',
            classificationModelCode: 'NEN3140',
            category: 'Elektra',
          },
        ],
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      const data = mockPrismaService.findingTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.categoryId).toBe('cat-1');
    });
  });
});
