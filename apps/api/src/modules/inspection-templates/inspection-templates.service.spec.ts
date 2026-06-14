import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, TemplateStatus } from '@prisma/client';
import { InspectionTemplatesService } from './inspection-templates.service';
import { PrismaService } from '@/prisma';

describe('InspectionTemplatesService', () => {
  let service: InspectionTemplatesService;

  const mockPrismaService = {
    inspectionTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inspectionTemplateChecklistLink: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
    },
    inspectionTemplateMeasurementSheetLink: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
    },
    inspectionTemplateVersionHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    checklist: { findUnique: jest.fn() },
    measurementSheetTemplate: { findUnique: jest.fn() },
    classificationModel: { findUnique: jest.fn() },
    normTypeDefinition: { findUnique: jest.fn() },
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

  // Make $transaction invoke its callback with the mock client (tx === prisma)
  const runTransaction = async (cb: any) => cb(mockPrismaService);

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(runTransaction);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionTemplatesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InspectionTemplatesService>(InspectionTemplatesService);
  });

  describe('findAll', () => {
    it('should scope an org user to org + system', async () => {
      mockPrismaService.inspectionTemplate.findMany.mockResolvedValue([]);
      await service.findAll(mockUser);

      const call = mockPrismaService.inspectionTemplate.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toEqual([
        { orgId: 'org-1' },
        { orgId: null, isSystem: true },
      ]);
    });

    it('should not scope by org for SUPERUSER', async () => {
      mockPrismaService.inspectionTemplate.findMany.mockResolvedValue([]);
      await service.findAll(mockSuperuser);

      const call = mockPrismaService.inspectionTemplate.findMany.mock.calls[0][0];
      expect(call.where).toEqual({});
    });

    it('should add normType + status filters', async () => {
      mockPrismaService.inspectionTemplate.findMany.mockResolvedValue([]);
      await service.findAll(mockUser, { normType: 'NEN1010', status: TemplateStatus.ACTIEF });

      const call = mockPrismaService.inspectionTemplate.findMany.mock.calls[0][0];
      expect(call.where.AND).toContainEqual({ normTypeCode: 'NEN1010' });
      expect(call.where.AND).toContainEqual({ status: TemplateStatus.ACTIEF });
    });
  });

  describe('findById', () => {
    it('should throw NL NotFoundException when missing', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findById('nope', mockUser)).rejects.toThrow(
        new NotFoundException('Inspectie-template niet gevonden'),
      );
    });

    it('should hide another org row (404)', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'other-org',
        isSystem: false,
      });
      await expect(service.findById('t-1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should allow a system row for an org user', async () => {
      const sys = { id: 's-1', orgId: null, isSystem: true };
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(sys);
      await expect(service.findById('s-1', mockUser)).resolves.toBe(sys);
    });
  });

  describe('create', () => {
    it('should create an org template', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({ id: 'cm-1' });
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({ code: 'NEN1010' });
      mockPrismaService.inspectionTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.inspectionTemplate.create.mockResolvedValue({ id: 'new-1' });

      await service.create(mockUser, {
        code: 'T1',
        name: 'Template 1',
        normTypeCode: 'NEN1010',
        classificationModelId: 'cm-1',
      } as any);

      const data = mockPrismaService.inspectionTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.createdBy).toBe('user-1');
    });

    it('should create a system template for SUPERUSER when isSystem=true', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({ id: 'cm-1' });
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({ code: 'NEN1010' });
      mockPrismaService.inspectionTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.inspectionTemplate.create.mockResolvedValue({ id: 'sys-new' });

      await service.create(mockSuperuser, {
        code: 'SYS',
        name: 'System',
        normTypeCode: 'NEN1010',
        classificationModelId: 'cm-1',
        isSystem: true,
      } as any);

      const data = mockPrismaService.inspectionTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBeNull();
      expect(data.isSystem).toBe(true);
    });

    it('should reject an unknown classification model', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser, {
          code: 'T1',
          name: 'T',
          normTypeCode: 'NEN1010',
          classificationModelId: 'bad',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.inspectionTemplate.create).not.toHaveBeenCalled();
    });

    it('should reject an unknown norm type', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({ id: 'cm-1' });
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser, {
          code: 'T1',
          name: 'T',
          normTypeCode: 'BAD',
          classificationModelId: 'cm-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a duplicate code', async () => {
      mockPrismaService.classificationModel.findUnique.mockResolvedValue({ id: 'cm-1' });
      mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({ code: 'NEN1010' });
      mockPrismaService.inspectionTemplate.findFirst.mockResolvedValue({ id: 'dup' });

      await expect(
        service.create(mockUser, {
          code: 'T1',
          name: 'T',
          normTypeCode: 'NEN1010',
          classificationModelId: 'cm-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update / assertConcept / assertManageable', () => {
    it('should block editing a non-CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.ACTIEF,
      });

      await expect(
        service.update('t-1', mockUser, { name: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.inspectionTemplate.update).not.toHaveBeenCalled();
    });

    it('should block an org-admin from editing a system template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 's-1',
        orgId: null,
        isSystem: true,
        status: TemplateStatus.CONCEPT,
      });

      await expect(
        service.update('s-1', mockUser, { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow editing an own CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.CONCEPT,
      });
      mockPrismaService.inspectionTemplate.update.mockResolvedValue({ id: 't-1', name: 'New' });

      const res = await service.update('t-1', mockUser, { name: 'New' } as any);
      expect(res.name).toBe('New');
    });
  });

  describe('delete', () => {
    it('should reject deleting a non-CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.ACTIEF,
      });
      await expect(service.delete('t-1', mockUser)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.inspectionTemplate.delete).not.toHaveBeenCalled();
    });
  });

  describe('fork', () => {
    it('should reject a superuser forking', async () => {
      await expect(service.fork('s-1', mockSuperuser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject forking a non-system template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        version: '1.0',
      });
      await expect(service.fork('t-1', mockUser, {})).rejects.toThrow(BadRequestException);
    });

    it('should fork a system template into the org as CONCEPT and copy links', async () => {
      const sys = {
        id: 's-1',
        orgId: null,
        isSystem: true,
        code: 'SYS',
        name: 'System',
        description: 'd',
        normTypeCode: 'NEN1010',
        classificationModelId: 'cm-1',
        version: '1.0',
      };
      // findById (source) → then findFirst (existing fork check) → create → copyLinks → findById (return)
      mockPrismaService.inspectionTemplate.findUnique
        .mockResolvedValueOnce(sys) // source
        .mockResolvedValueOnce({ id: 'fork-1', orgId: 'org-1', isSystem: false }); // return
      mockPrismaService.inspectionTemplate.findFirst.mockResolvedValue(null);
      mockPrismaService.inspectionTemplate.create.mockResolvedValue({ id: 'fork-1' });
      mockPrismaService.inspectionTemplateChecklistLink.findMany.mockResolvedValue([
        { checklistId: 'cl-1', assetTypes: ['a'], sortOrder: 0 },
      ]);
      mockPrismaService.inspectionTemplateMeasurementSheetLink.findMany.mockResolvedValue([]);

      await service.fork('s-1', mockUser, {});

      const data = mockPrismaService.inspectionTemplate.create.mock.calls[0][0].data;
      expect(data.orgId).toBe('org-1');
      expect(data.isSystem).toBe(false);
      expect(data.status).toBe(TemplateStatus.CONCEPT);
      expect(data.forkedFromId).toBe('s-1');
      expect(data.version).toBe('1.0.1');
      expect(data.code).toBe('SYS-FORK');
      expect(mockPrismaService.inspectionTemplateChecklistLink.createMany).toHaveBeenCalled();
    });

    it('should reject when a fork already exists', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 's-1',
        orgId: null,
        isSystem: true,
        version: '1.0',
        code: 'SYS',
        name: 'System',
      });
      mockPrismaService.inspectionTemplate.findFirst.mockResolvedValue({ id: 'existing-fork' });

      await expect(service.fork('s-1', mockUser, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('publish / retire', () => {
    it('should publish a CONCEPT template + write history', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.CONCEPT,
        version: '1.0',
      });
      mockPrismaService.inspectionTemplate.update.mockResolvedValue({
        id: 't-1',
        status: TemplateStatus.ACTIEF,
      });

      const res = await service.publish('t-1', mockUser, {});
      expect(res.status).toBe(TemplateStatus.ACTIEF);
      expect(mockPrismaService.inspectionTemplateVersionHistory.create).toHaveBeenCalled();
      const hist = mockPrismaService.inspectionTemplateVersionHistory.create.mock.calls[0][0].data;
      expect(hist.fromStatus).toBe(TemplateStatus.CONCEPT);
      expect(hist.toStatus).toBe(TemplateStatus.ACTIEF);
      expect(hist.changedBy).toBe('user-1');
    });

    it('should reject publishing a non-CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.ACTIEF,
        version: '1.0',
      });
      await expect(service.publish('t-1', mockUser, {})).rejects.toThrow(BadRequestException);
    });

    it('should retire an ACTIEF template + write history', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.ACTIEF,
        version: '1.0',
      });
      mockPrismaService.inspectionTemplate.update.mockResolvedValue({
        id: 't-1',
        status: TemplateStatus.VERVALLEN,
      });

      const res = await service.retire('t-1', mockUser, {});
      expect(res.status).toBe(TemplateStatus.VERVALLEN);
      expect(mockPrismaService.inspectionTemplateVersionHistory.create).toHaveBeenCalled();
    });

    it('should reject retiring a CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.CONCEPT,
        version: '1.0',
      });
      await expect(service.retire('t-1', mockUser, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('createNewVersion', () => {
    it('should clone to a CONCEPT version, bump version, set previousVersionId + history', async () => {
      const original = {
        id: 't-1',
        orgId: 'org-1',
        isSystem: false,
        status: TemplateStatus.ACTIEF,
        version: '1.0',
        code: 'T1',
        name: 'T1',
        description: 'd',
        normTypeCode: 'NEN1010',
        classificationModelId: 'cm-1',
        forkedFromId: null,
      };
      mockPrismaService.inspectionTemplate.findUnique
        .mockResolvedValueOnce(original) // findById original
        .mockResolvedValueOnce({ id: 'v2', orgId: 'org-1', isSystem: false }); // return
      mockPrismaService.inspectionTemplate.create.mockResolvedValue({ id: 'v2' });
      mockPrismaService.inspectionTemplateChecklistLink.findMany.mockResolvedValue([]);
      mockPrismaService.inspectionTemplateMeasurementSheetLink.findMany.mockResolvedValue([]);

      await service.createNewVersion('t-1', mockUser, {});

      const data = mockPrismaService.inspectionTemplate.create.mock.calls[0][0].data;
      expect(data.status).toBe(TemplateStatus.CONCEPT);
      expect(data.previousVersionId).toBe('t-1');
      expect(data.version).toBe('1.0.1');
      expect(mockPrismaService.inspectionTemplateVersionHistory.create).toHaveBeenCalled();
    });
  });

  describe('checklist links', () => {
    const conceptTemplate = {
      id: 't-1',
      orgId: 'org-1',
      isSystem: false,
      status: TemplateStatus.CONCEPT,
    };

    it('should add a link to a system checklist', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.checklist.findUnique.mockResolvedValue({ id: 'cl-1', orgId: null });
      mockPrismaService.inspectionTemplateChecklistLink.create.mockResolvedValue({ id: 'link-1' });

      const res = await service.addChecklistLink('t-1', mockUser, {
        checklistId: 'cl-1',
        assetTypes: ['a'],
        sortOrder: 0,
      } as any);
      expect(res.id).toBe('link-1');
    });

    it('should add a link to an own-org checklist', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.checklist.findUnique.mockResolvedValue({ id: 'cl-1', orgId: 'org-1' });
      mockPrismaService.inspectionTemplateChecklistLink.create.mockResolvedValue({ id: 'link-1' });

      await service.addChecklistLink('t-1', mockUser, {
        checklistId: 'cl-1',
        assetTypes: [],
        sortOrder: 0,
      } as any);
      expect(mockPrismaService.inspectionTemplateChecklistLink.create).toHaveBeenCalled();
    });

    it('should reject a cross-org checklist (403)', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.checklist.findUnique.mockResolvedValue({ id: 'cl-1', orgId: 'other-org' });

      await expect(
        service.addChecklistLink('t-1', mockUser, {
          checklistId: 'cl-1',
          assetTypes: [],
          sortOrder: 0,
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.inspectionTemplateChecklistLink.create).not.toHaveBeenCalled();
    });

    it('should reject an unknown checklist (400)', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.checklist.findUnique.mockResolvedValue(null);

      await expect(
        service.addChecklistLink('t-1', mockUser, {
          checklistId: 'bad',
          assetTypes: [],
          sortOrder: 0,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject linking on a non-CONCEPT template', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
        ...conceptTemplate,
        status: TemplateStatus.ACTIEF,
      });
      await expect(
        service.addChecklistLink('t-1', mockUser, {
          checklistId: 'cl-1',
          assetTypes: [],
          sortOrder: 0,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove a link', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.inspectionTemplateChecklistLink.findFirst.mockResolvedValue({ id: 'link-1' });
      mockPrismaService.inspectionTemplateChecklistLink.delete.mockResolvedValue({ id: 'link-1' });

      const res = await service.removeChecklistLink('t-1', 'link-1', mockUser);
      expect(res).toEqual({ deleted: true });
    });
  });

  describe('measurement sheet links', () => {
    const conceptTemplate = {
      id: 't-1',
      orgId: 'org-1',
      isSystem: false,
      status: TemplateStatus.CONCEPT,
    };

    it('should add a link to a global measurement sheet', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.measurementSheetTemplate.findUnique.mockResolvedValue({ id: 'ms-1' });
      mockPrismaService.inspectionTemplateMeasurementSheetLink.create.mockResolvedValue({ id: 'link-1' });

      const res = await service.addMeasurementSheetLink('t-1', mockUser, {
        measurementSheetTemplateId: 'ms-1',
        assetTypes: [],
        sortOrder: 0,
      } as any);
      expect(res.id).toBe('link-1');
    });

    it('should reject an unknown measurement sheet (404)', async () => {
      mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue(conceptTemplate);
      mockPrismaService.measurementSheetTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.addMeasurementSheetLink('t-1', mockUser, {
          measurementSheetTemplateId: 'bad',
          assetTypes: [],
          sortOrder: 0,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
