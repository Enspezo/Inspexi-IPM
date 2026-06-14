import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, MeasurementSheetRecordStatus } from '@prisma/client';
import { MeasurementSheetRecordsService } from './measurement-sheet-records.service';
import { PrismaService } from '@/prisma';

describe('MeasurementSheetRecordsService', () => {
  let service: MeasurementSheetRecordsService;

  const mockPrismaService = {
    measurementSheetRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    measurementSheetTemplate: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    inspectionPlan: { findUnique: jest.fn(), findMany: jest.fn() },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  // Minimal template with 1 section + 1 required field
  const activeTemplate = {
    id: 'tmpl-1',
    code: 'MS-1',
    name: 'Meetstaat 1',
    version: '1.2',
    normTypeCode: 'norm-x',
    assetTypes: [],
    locationTypes: [],
    status: 'ACTIEF',
    finalCheckRules: [],
    sections: [
      {
        code: 'sec1',
        name: 'Sectie 1',
        description: null,
        isRepeating: false,
        minRows: 1,
        sortOrder: 0,
        collapsible: true,
        defaultCollapsed: false,
        rowValidationRules: [],
        fields: [
          {
            code: 'f1',
            name: 'Veld 1',
            description: null,
            fieldType: 'NUMBER',
            sortOrder: 0,
            placeholder: null,
            width: 'FULL',
            unit: null,
            decimals: null,
            minValue: null,
            maxValue: null,
            dropdownOptions: null,
            formula: null,
            formulaDependencies: [],
            isRequired: true,
            passFailEnabled: false,
            passFailOperator: null,
            passFailValue: null,
            passFailMinValue: null,
            passFailMaxValue: null,
            passFailValues: null,
            passFailFailMessage: null,
            autoFindingEnabled: false,
            autoFindingTemplateId: null,
            copyValueOnNewRow: false,
            allowBulkEdit: false,
          },
        ],
      },
    ],
  };

  // The snapshot shape stored on a record (same structure, Decimals already stringified)
  const snapshot = {
    id: 'tmpl-1',
    code: 'MS-1',
    name: 'Meetstaat 1',
    version: '1.2',
    normTypeCode: 'norm-x',
    assetTypes: [],
    locationTypes: [],
    finalCheckRules: [],
    sections: [
      {
        code: 'sec1',
        name: 'Sectie 1',
        isRepeating: false,
        minRows: 1,
        sortOrder: 0,
        fields: [
          {
            code: 'f1',
            name: 'Veld 1',
            isRequired: true,
            passFailEnabled: false,
            passFailOperator: null,
            passFailFailMessage: null,
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementSheetRecordsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MeasurementSheetRecordsService>(MeasurementSheetRecordsService);
  });

  describe('create (snapshot)', () => {
    it('captures templateVersion, snapshots structure, derives orgId from asset', async () => {
      // assertSameOrg(asset) → org match
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      // scoped asset lookup (orgId source)
      mockPrismaService.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        orgId: 'org-1',
        inspectionPlanId: null,
      });
      mockPrismaService.measurementSheetTemplate.findUnique.mockResolvedValue(activeTemplate);
      mockPrismaService.measurementSheetRecord.create.mockImplementation(async (args: any) => ({
        id: 'rec-new',
        ...args.data,
      }));

      const result = await service.create(
        mockUser,
        { templateId: 'tmpl-1', assetId: 'asset-1' } as any,
        'device-xyz',
      );

      expect(result.id).toBe('rec-new');
      const createArgs = mockPrismaService.measurementSheetRecord.create.mock.calls[0][0];
      expect(createArgs.data.orgId).toBe('org-1');
      expect(createArgs.data.templateId).toBe('tmpl-1');
      expect(createArgs.data.assetId).toBe('asset-1');
      expect(createArgs.data.templateVersion).toBe('1.2');
      expect(createArgs.data.status).toBe(MeasurementSheetRecordStatus.IN_PROGRESS);
      expect(createArgs.data.deviceId).toBe('device-xyz');
      expect(createArgs.data.createdBy).toBe('user-1');
      // snapshot contains the section + field structure
      expect(createArgs.data.templateSnapshot.sections[0].code).toBe('sec1');
      expect(createArgs.data.templateSnapshot.sections[0].fields[0].code).toBe('f1');
      // initial data: section row 0 with the field set to null
      expect(createArgs.data.data.sec1['0'].f1).toEqual({ value: null, passFail: null });
    });

    it('throws Forbidden when asset belongs to another org (assertSameOrg)', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create(mockUser, { templateId: 'tmpl-1', assetId: 'asset-1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when asset does not exist (assertSameOrg)', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser, { templateId: 'tmpl-1', assetId: 'asset-x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden when inspectionPlan belongs to another org', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.create(mockUser, {
          templateId: 'tmpl-1',
          assetId: 'asset-1',
          inspectionPlanId: 'plan-9',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequest when asset is not part of the given plan', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.inspectionPlan.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        orgId: 'org-1',
        inspectionPlanId: 'plan-OTHER',
      });

      await expect(
        service.create(mockUser, {
          templateId: 'tmpl-1',
          assetId: 'asset-1',
          inspectionPlanId: 'plan-1',
        } as any),
      ).rejects.toThrow('Asset hoort niet bij het opgegeven inspectieplan');
    });

    it('throws NotFound (NL) when template missing', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        orgId: 'org-1',
        inspectionPlanId: null,
      });
      mockPrismaService.measurementSheetTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser, { templateId: 'gone', assetId: 'asset-1' } as any),
      ).rejects.toThrow('Meetstaat-template niet gevonden');
    });

    it('throws BadRequest when template is not ACTIEF', async () => {
      mockPrismaService.asset.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.asset.findFirst.mockResolvedValue({
        id: 'asset-1',
        orgId: 'org-1',
        inspectionPlanId: null,
      });
      mockPrismaService.measurementSheetTemplate.findUnique.mockResolvedValue({
        ...activeTemplate,
        status: 'CONCEPT',
      });

      await expect(
        service.create(mockUser, { templateId: 'tmpl-1', assetId: 'asset-1' } as any),
      ).rejects.toThrow('Alleen ACTIEVE templates kunnen gebruikt worden');
    });
  });

  describe('update (IN_PROGRESS-only guard)', () => {
    it('updates data + evaluates pass/fail when IN_PROGRESS', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: snapshot,
        data: {},
      });
      mockPrismaService.measurementSheetRecord.update.mockResolvedValue({ id: 'rec-1' });

      await service.update(
        'rec-1',
        mockUser,
        { data: { sec1: { '0': { f1: { value: 5 } } } } } as any,
        'dev-1',
      );

      const updateArgs = mockPrismaService.measurementSheetRecord.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'rec-1' });
      expect(updateArgs.data.deviceId).toBe('dev-1');
      expect(updateArgs.data.syncedAt).toBeInstanceOf(Date);
      // pass/fail disabled on f1 → null
      expect(updateArgs.data.data.sec1['0'].f1).toEqual({ value: 5, passFail: null });
    });

    it('blocks update when not IN_PROGRESS', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.COMPLETED,
        templateSnapshot: snapshot,
        data: {},
      });

      await expect(
        service.update('rec-1', mockUser, { data: {} } as any),
      ).rejects.toThrow('Alleen meetstaten met status IN_PROGRESS kunnen bijgewerkt worden');
      expect(mockPrismaService.measurementSheetRecord.update).not.toHaveBeenCalled();
    });

    it('throws NotFound (NL) when record missing', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.update('gone', mockUser, { data: {} } as any),
      ).rejects.toThrow('Meetstaat niet gevonden');
    });
  });

  describe('delete (IN_PROGRESS-only, hard delete)', () => {
    it('hard-deletes an IN_PROGRESS record', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: snapshot,
        data: {},
      });
      mockPrismaService.measurementSheetRecord.delete.mockResolvedValue({});

      const result = await service.delete('rec-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.measurementSheetRecord.delete).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
      });
    });

    it('blocks delete when not IN_PROGRESS', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.VALIDATED,
        templateSnapshot: snapshot,
        data: {},
      });

      await expect(service.delete('rec-1', mockUser)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.measurementSheetRecord.delete).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('reports a required-field error against the snapshot', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: snapshot,
        data: { sec1: { '0': { f1: { value: null } } } },
      });

      const result = await service.validate('rec-1', mockUser);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fieldCode).toBe('f1');
      expect(result.errors[0].message).toContain('verplicht');
    });

    it('is valid when required field has a value', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: snapshot,
        data: { sec1: { '0': { f1: { value: 42 } } } },
      });

      const result = await service.validate('rec-1', mockUser);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('complete (final-check + status transition)', () => {
    it('sets COMPLETED + completedAt when valid and final-check passes', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: {
          ...snapshot,
          finalCheckRules: [{ type: 'allFieldsRequired' }],
        },
        data: { sec1: { '0': { f1: { value: 10 } } } },
      });
      mockPrismaService.measurementSheetRecord.update.mockResolvedValue({ id: 'rec-1' });

      await service.complete('rec-1', mockUser);

      const updateArgs = mockPrismaService.measurementSheetRecord.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(MeasurementSheetRecordStatus.COMPLETED);
      expect(updateArgs.data.finalCheckExecuted).toBe(true);
      expect(updateArgs.data.finalCheckPassed).toBe(true);
      expect(updateArgs.data.completedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.finalCheckResults.results[0].ruleType).toBe('allFieldsRequired');
    });

    it('stays IN_PROGRESS when validation fails (required field empty)', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
        templateSnapshot: {
          ...snapshot,
          finalCheckRules: [{ type: 'allFieldsRequired' }],
        },
        data: { sec1: { '0': { f1: { value: null } } } },
      });
      mockPrismaService.measurementSheetRecord.update.mockResolvedValue({ id: 'rec-1' });

      await service.complete('rec-1', mockUser);

      const updateArgs = mockPrismaService.measurementSheetRecord.update.mock.calls[0][0];
      expect(updateArgs.data.status).toBe(MeasurementSheetRecordStatus.IN_PROGRESS);
      expect(updateArgs.data.finalCheckExecuted).toBe(true);
      expect(updateArgs.data.finalCheckPassed).toBe(false);
      expect(updateArgs.data.completedAt).toBeNull();
    });

    it('blocks complete when not IN_PROGRESS', async () => {
      mockPrismaService.measurementSheetRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        orgId: 'org-1',
        status: MeasurementSheetRecordStatus.COMPLETED,
        templateSnapshot: snapshot,
        data: {},
      });

      await expect(service.complete('rec-1', mockUser)).rejects.toThrow(
        'Alleen meetstaten met status IN_PROGRESS kunnen afgerond worden',
      );
      expect(mockPrismaService.measurementSheetRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies org scope and passes through filters', async () => {
      mockPrismaService.measurementSheetRecord.findMany.mockResolvedValue([{ id: 'rec-1' }]);

      await service.findAll(mockUser, {
        assetId: 'asset-1',
        status: MeasurementSheetRecordStatus.IN_PROGRESS,
      } as any);

      const args = mockPrismaService.measurementSheetRecord.findMany.mock.calls[0][0];
      expect(args.where.orgId).toBe('org-1');
      expect(args.where.assetId).toBe('asset-1');
      expect(args.where.status).toBe(MeasurementSheetRecordStatus.IN_PROGRESS);
    });
  });
});
