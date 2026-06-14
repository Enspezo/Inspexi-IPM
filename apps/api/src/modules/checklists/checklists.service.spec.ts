import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, ChecklistStatus } from '@prisma/client';
import { ChecklistsService } from './checklists.service';
import { PrismaService } from '@/prisma';

describe('ChecklistsService', () => {
  let service: ChecklistsService;

  const mockPrismaService = {
    checklist: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    checklistItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    checklistItemLink: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    checklistVersionHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    category: {
      findFirst: jest.fn(),
    },
    normTypeDefinition: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
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
        ChecklistsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ChecklistsService>(ChecklistsService);
  });

  describe('findAll', () => {
    it('should scope to org + system for an org user', async () => {
      mockPrismaService.checklist.findMany.mockResolvedValue([]);

      await service.findAll(mockUser);

      const call = mockPrismaService.checklist.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toEqual([
        { orgId: 'org-1' },
        { orgId: null, isSystem: true },
      ]);
    });

    it('should not scope by org for SUPERUSER (sees everything)', async () => {
      mockPrismaService.checklist.findMany.mockResolvedValue([]);

      await service.findAll(mockSuperuser);

      const call = mockPrismaService.checklist.findMany.mock.calls[0][0];
      expect(call.where).toEqual({});
    });

    it('should apply normType/status/assetType/locationType filters', async () => {
      mockPrismaService.checklist.findMany.mockResolvedValue([]);

      await service.findAll(mockUser, {
        normType: 'NEN1010',
        status: ChecklistStatus.ACTIEF,
        assetType: 'verdeler',
        locationType: 'meterkast',
      });

      const call = mockPrismaService.checklist.findMany.mock.calls[0][0];
      const conditions = call.where.AND;
      expect(conditions).toContainEqual({ normTypeCode: 'NEN1010' });
      expect(conditions).toContainEqual({ status: ChecklistStatus.ACTIEF });
      expect(conditions).toContainEqual({ assetTypes: { has: 'verdeler' } });
      expect(conditions).toContainEqual({ locationTypes: { has: 'meterkast' } });
    });
  });

  describe('findById', () => {
    it('should return checklist when accessible', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        itemLinks: [],
      });

      const result = await service.findById('cl-1', mockUser);
      expect(result.id).toBe('cl-1');
    });

    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue(null);

      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Checklist niet gevonden'),
      );
    });

    it('should hide another org checklist (404)', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-x',
        orgId: 'other-org',
        isSystem: false,
      });

      await expect(service.findById('cl-x', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create an org checklist (initial history in tx)', async () => {
      mockPrismaService.normTypeDefinition.findFirst.mockResolvedValue({ id: 'n-1', code: 'NEN1010' });
      mockPrismaService.checklist.findFirst.mockResolvedValue(null);
      const tx = {
        checklist: { create: jest.fn().mockResolvedValue({ id: 'new-1', orgId: 'org-1' }) },
        checklistVersionHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrismaService.$transaction.mockImplementation((cb) => cb(tx));

      const result = await service.create(mockUser, {
        code: 'CL-1',
        name: 'Test checklist',
        normTypeCode: 'NEN1010',
        assetTypes: ['verdeler'],
      } as any);

      expect(result.id).toBe('new-1');
      const data = tx.checklist.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.status).toBe(ChecklistStatus.CONCEPT);
      expect(tx.checklistVersionHistory.create).toHaveBeenCalled();
    });

    it('should create a system checklist for SUPERUSER', async () => {
      mockPrismaService.normTypeDefinition.findFirst.mockResolvedValue({ id: 'n-1', code: 'NEN1010' });
      mockPrismaService.checklist.findFirst.mockResolvedValue(null);
      const tx = {
        checklist: { create: jest.fn().mockResolvedValue({ id: 'sys-new', orgId: null }) },
        checklistVersionHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrismaService.$transaction.mockImplementation((cb) => cb(tx));

      await service.create(mockSuperuser, {
        name: 'Sys checklist',
        normTypeCode: 'NEN1010',
        assetTypes: ['verdeler'],
      } as any);

      const data = tx.checklist.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
    });

    it('should reject an unknown normTypeCode', async () => {
      mockPrismaService.normTypeDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.create(mockUser, {
          name: 'Bad norm',
          normTypeCode: 'ONBEKEND',
          assetTypes: ['x'],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should block an org-admin from creating a system checklist', async () => {
      await expect(
        service.create(mockUser, {
          name: 'Hack',
          normTypeCode: 'NEN1010',
          assetTypes: ['x'],
          isSystem: true,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.normTypeDefinition.findFirst.mockResolvedValue({ id: 'n-1', code: 'NEN1010' });
      mockPrismaService.checklist.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(mockUser, {
          code: 'DUP',
          name: 'Dup',
          normTypeCode: 'NEN1010',
          assetTypes: ['x'],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update — CONCEPT-only + assertManageable', () => {
    it('should block editing a non-CONCEPT checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.ACTIEF,
        itemLinks: [],
      });

      await expect(
        service.update('cl-1', mockUser, { name: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.checklist.update).not.toHaveBeenCalled();
    });

    it('should block an org-admin from editing a system checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'sys-1',
        orgId: null,
        isSystem: true,
        status: ChecklistStatus.CONCEPT,
        itemLinks: [],
      });

      await expect(
        service.update('sys-1', mockUser, { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update an org CONCEPT checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.CONCEPT,
        itemLinks: [],
      });
      mockPrismaService.checklist.update.mockResolvedValue({ id: 'cl-1', name: 'Nieuw' });

      const result = await service.update('cl-1', mockUser, { name: 'Nieuw' } as any);
      expect(result.name).toBe('Nieuw');
    });
  });

  describe('addItem — FK org-or-system check + reorder', () => {
    const conceptChecklist = {
      id: 'cl-1',
      orgId: 'org-1',
      isSystem: false,
      status: ChecklistStatus.CONCEPT,
      itemLinks: [],
    };

    it('should link an accessible item', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue(conceptChecklist);
      mockPrismaService.checklistItem.findFirst.mockResolvedValue({ id: 'item-1' });
      mockPrismaService.checklistItemLink.findFirst.mockResolvedValue(null);
      mockPrismaService.checklistItemLink.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrismaService.checklistItemLink.create.mockResolvedValue({ id: 'link-1', sortOrder: 3 });

      const result = await service.addItem('cl-1', mockUser, { checklistItemId: 'item-1' } as any);

      expect(result.id).toBe('link-1');
      // org-or-system scope applied on the item lookup
      const where = mockPrismaService.checklistItem.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ orgId: 'org-1' }, { orgId: null, isSystem: true }]);
    });

    it('should 404 when the item is not accessible', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue(conceptChecklist);
      mockPrismaService.checklistItem.findFirst.mockResolvedValue(null);

      await expect(
        service.addItem('cl-1', mockUser, { checklistItemId: 'item-x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject a duplicate link', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue(conceptChecklist);
      mockPrismaService.checklistItem.findFirst.mockResolvedValue({ id: 'item-1' });
      mockPrismaService.checklistItemLink.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addItem('cl-1', mockUser, { checklistItemId: 'item-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reorder item links in a transaction', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue(conceptChecklist);
      mockPrismaService.$transaction.mockResolvedValue([]);

      await service.reorderItems('cl-1', mockUser, ['link-b', 'link-a']);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.checklistItemLink.update).toHaveBeenCalledWith({
        where: { id: 'link-b' },
        data: { sortOrder: 0 },
      });
      expect(mockPrismaService.checklistItemLink.update).toHaveBeenCalledWith({
        where: { id: 'link-a' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('publish', () => {
    it('should publish a CONCEPT checklist with items', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.CONCEPT,
        version: '1.0',
        name: 'C',
        code: 'C1',
        description: null,
        normTypeCode: 'NEN1010',
        assetTypes: ['verdeler'],
        locationTypes: [],
        itemLinks: [
          {
            sortOrder: 0,
            isRequired: true,
            categoryOverride: null,
            checklistItem: { code: 'i1', question: 'Q?', category: { name: 'Cat' } },
          },
        ],
      });
      mockPrismaService.$transaction.mockResolvedValue([
        { id: 'cl-1', status: ChecklistStatus.ACTIEF },
      ]);

      const result = await service.publish('cl-1', mockUser, { changeDescription: 'Gereed' } as any);

      expect(result.status).toBe(ChecklistStatus.ACTIEF);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should reject publishing a non-CONCEPT checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.ACTIEF,
        itemLinks: [{}],
      });

      await expect(
        service.publish('cl-1', mockUser, { changeDescription: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject publishing without items', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.CONCEPT,
        itemLinks: [],
      });

      await expect(
        service.publish('cl-1', mockUser, { changeDescription: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('retire', () => {
    it('should retire an ACTIEF checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.ACTIEF,
        version: '1.0',
        itemLinks: [],
      });
      mockPrismaService.$transaction.mockResolvedValue([
        { id: 'cl-1', status: ChecklistStatus.VERVALLEN },
      ]);

      const result = await service.retire('cl-1', mockUser, { changeDescription: 'Verlopen' } as any);

      expect(result.status).toBe(ChecklistStatus.VERVALLEN);
    });

    it('should reject retiring a non-ACTIEF checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.CONCEPT,
        itemLinks: [],
      });

      await expect(
        service.retire('cl-1', mockUser, { changeDescription: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNewVersion', () => {
    it('should clone to a new CONCEPT version with bumped version + previousVersionId', async () => {
      mockPrismaService.checklist.findUnique
        .mockResolvedValueOnce({
          id: 'cl-1',
          orgId: 'org-1',
          isSystem: false,
          status: ChecklistStatus.ACTIEF,
          version: '1.0',
          code: 'C1',
          name: 'C',
          description: null,
          normTypeCode: 'NEN1010',
          assetTypes: ['verdeler'],
          locationTypes: [],
          itemLinks: [],
        })
        .mockResolvedValueOnce({
          id: 'cl-2',
          orgId: 'org-1',
          isSystem: false,
          version: '1.1',
          status: ChecklistStatus.CONCEPT,
          itemLinks: [],
        });

      mockPrismaService.checklistItemLink.findMany.mockResolvedValue([
        { checklistItemId: 'item-1', sortOrder: 0, isRequired: true, categoryOverride: null },
      ]);

      const tx = {
        checklist: { create: jest.fn().mockResolvedValue({ id: 'cl-2', version: '1.1' }) },
        checklistItemLink: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        checklistVersionHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrismaService.$transaction.mockImplementation((cb) => cb(tx));

      const result = await service.createNewVersion('cl-1', mockUser, {} as any);

      expect(result.id).toBe('cl-2');
      const data = tx.checklist.create.mock.calls[0][0].data;
      expect(data.version).toBe('1.1');
      expect(data.previousVersionId).toBe('cl-1');
      expect(data.status).toBe(ChecklistStatus.CONCEPT);
      expect(tx.checklistItemLink.createMany).toHaveBeenCalled();
      expect(tx.checklistVersionHistory.create).toHaveBeenCalled();
    });
  });

  describe('delete — CONCEPT-only', () => {
    it('should delete a CONCEPT checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.CONCEPT,
        itemLinks: [],
      });
      mockPrismaService.checklist.delete.mockResolvedValue({});

      const result = await service.delete('cl-1', mockUser);
      expect(result).toEqual({ deleted: true });
    });

    it('should reject deleting a non-CONCEPT checklist', async () => {
      mockPrismaService.checklist.findUnique.mockResolvedValue({
        id: 'cl-1',
        orgId: 'org-1',
        isSystem: false,
        status: ChecklistStatus.ACTIEF,
        itemLinks: [],
      });

      await expect(service.delete('cl-1', mockUser)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.checklist.delete).not.toHaveBeenCalled();
    });
  });
});
