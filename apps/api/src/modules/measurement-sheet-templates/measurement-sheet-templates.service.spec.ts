import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeasurementSheetTemplateStatus, Role } from '@prisma/client';
import { MeasurementSheetTemplatesService } from './measurement-sheet-templates.service';
import { MeasurementSheetSectionsService } from './measurement-sheet-sections.service';
import { MeasurementSheetFieldsService } from './measurement-sheet-fields.service';
import { PrismaService } from '@/prisma';

describe('MeasurementSheetTemplates module', () => {
  let templatesService: MeasurementSheetTemplatesService;
  let sectionsService: MeasurementSheetSectionsService;
  let fieldsService: MeasurementSheetFieldsService;

  const mockPrisma = {
    measurementSheetTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    measurementSheetSection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    measurementSheetField: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    measurementSheetVersionHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    normTypeDefinition: {
      findUnique: jest.fn(),
    },
    // Assigned after declaration to avoid self-reference in the initializer.
    $transaction: jest.fn() as jest.Mock,
  };

  // Supports both array-form and callback-form $transaction.
  mockPrisma.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  );

  const superuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  const orgAdmin = {
    id: 'admin-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementSheetTemplatesService,
        MeasurementSheetSectionsService,
        MeasurementSheetFieldsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    templatesService = module.get(MeasurementSheetTemplatesService);
    sectionsService = module.get(MeasurementSheetSectionsService);
    fieldsService = module.get(MeasurementSheetFieldsService);
  });

  // ── CRUD + gating ────────────────────────────────────

  describe('create', () => {
    it('lets a SUPERUSER create a CONCEPT template + initial history', async () => {
      mockPrisma.normTypeDefinition.findUnique.mockResolvedValue({
        code: 'NEN1010',
      });
      mockPrisma.measurementSheetTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.measurementSheetTemplate.create.mockResolvedValue({
        id: 't-1',
        code: 'NEN1010_HV',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        version: '1.0',
      });
      mockPrisma.measurementSheetVersionHistory.create.mockResolvedValue({});

      const result = await templatesService.create(superuser, {
        code: 'NEN1010_HV',
        name: 'Hoofdverdeler',
        normType: 'NEN1010',
        assetTypes: ['hoofdverdeler'],
      });

      expect(result.id).toBe('t-1');
      expect(mockPrisma.measurementSheetTemplate.create).toHaveBeenCalled();
      expect(
        mockPrisma.measurementSheetVersionHistory.create,
      ).toHaveBeenCalled();
      const createArg =
        mockPrisma.measurementSheetTemplate.create.mock.calls[0][0];
      expect(createArg.data.normTypeCode).toBe('NEN1010');
      expect(createArg.data.createdBy).toBe('super-1');
    });

    it('rejects a non-SUPERUSER write with 403', async () => {
      await expect(
        templatesService.create(orgAdmin, {
          code: 'X',
          name: 'X',
          normType: 'NEN1010',
          assetTypes: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.measurementSheetTemplate.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown normType', async () => {
      mockPrisma.normTypeDefinition.findUnique.mockResolvedValue(null);
      await expect(
        templatesService.create(superuser, {
          code: 'X',
          name: 'X',
          normType: 'BOGUS',
          assetTypes: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate CONCEPT code', async () => {
      mockPrisma.normTypeDefinition.findUnique.mockResolvedValue({
        code: 'NEN1010',
      });
      mockPrisma.measurementSheetTemplate.findFirst.mockResolvedValue({
        id: 'existing',
      });
      await expect(
        templatesService.create(superuser, {
          code: 'DUP',
          name: 'Dup',
          normType: 'NEN1010',
          assetTypes: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('blocks updating a non-CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.ACTIEF,
        sections: [],
      });
      await expect(
        templatesService.update('t-1', superuser, { name: 'New' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-SUPERUSER write with 403', async () => {
      await expect(
        templatesService.update('t-1', orgAdmin, { name: 'New' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('blocks deleting a non-CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.ACTIEF,
        sections: [],
      });
      await expect(
        templatesService.delete('t-1', superuser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findById', () => {
    it('throws 404 when not found', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue(null);
      await expect(templatesService.findById('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── Version transitions ──────────────────────────────

  describe('publish', () => {
    it('moves CONCEPT→ACTIEF and writes history', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        version: '1.0',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        normTypeCode: 'NEN1010',
        sections: [{ name: 'S1', fields: [{ id: 'f-1' }] }],
      });
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.ACTIEF,
      });
      mockPrisma.measurementSheetVersionHistory.create.mockResolvedValue({});

      const result = await templatesService.publish('t-1', superuser, {
        changeDescription: 'Eerste publicatie',
      });

      expect(result.status).toBe(MeasurementSheetTemplateStatus.ACTIEF);
      const historyArg =
        mockPrisma.measurementSheetVersionHistory.create.mock.calls[0][0];
      expect(historyArg.data.fromStatus).toBe(
        MeasurementSheetTemplateStatus.CONCEPT,
      );
      expect(historyArg.data.toStatus).toBe(
        MeasurementSheetTemplateStatus.ACTIEF,
      );
    });

    it('refuses to publish a template without sections', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        version: '1.0',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        sections: [],
      });
      await expect(
        templatesService.publish('t-1', superuser, {
          changeDescription: 'Geen secties',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to publish when a section has no fields', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        version: '1.0',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        sections: [{ name: 'Leeg', fields: [] }],
      });
      await expect(
        templatesService.publish('t-1', superuser, {
          changeDescription: 'Lege sectie',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects publish by a non-SUPERUSER', async () => {
      await expect(
        templatesService.publish('t-1', orgAdmin, {
          changeDescription: 'nope',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('retire', () => {
    it('moves ACTIEF→VERVALLEN', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        version: '1.0',
        status: MeasurementSheetTemplateStatus.ACTIEF,
        sections: [],
      });
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.VERVALLEN,
      });
      mockPrisma.measurementSheetVersionHistory.create.mockResolvedValue({});

      const result = await templatesService.retire('t-1', superuser, {
        changeDescription: 'Vervallen reden',
      });
      expect(result.status).toBe(MeasurementSheetTemplateStatus.VERVALLEN);
    });

    it('refuses to retire a non-ACTIEF template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        version: '1.0',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        sections: [],
      });
      await expect(
        templatesService.retire('t-1', superuser, {
          changeDescription: 'nope',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createNewVersion', () => {
    it('clones to a new CONCEPT with bumped version + copies sections/fields', async () => {
      mockPrisma.measurementSheetTemplate.findUnique
        .mockResolvedValueOnce({
          id: 't-1',
          code: 'C',
          name: 'N',
          description: null,
          normTypeCode: 'NEN1010',
          assetTypes: [],
          locationTypes: [],
          version: '1.3',
          status: MeasurementSheetTemplateStatus.ACTIEF,
          finalCheckRules: [],
          sections: [
            {
              code: 's1',
              name: 'S1',
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
                  name: 'F1',
                  fieldType: 'NUMBER',
                  sortOrder: 0,
                  formulaDependencies: [],
                },
              ],
            },
          ],
        })
        // second findById (the reload of the new template)
        .mockResolvedValueOnce({ id: 't-2', version: '1.4' });

      mockPrisma.measurementSheetTemplate.create.mockResolvedValue({
        id: 't-2',
        version: '1.4',
      });
      mockPrisma.measurementSheetSection.create.mockResolvedValue({
        id: 'ns-1',
      });
      mockPrisma.measurementSheetField.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.measurementSheetVersionHistory.create.mockResolvedValue({});

      const result = await templatesService.createNewVersion('t-1', superuser, {});

      expect(result.id).toBe('t-2');
      const createArg =
        mockPrisma.measurementSheetTemplate.create.mock.calls[0][0];
      expect(createArg.data.version).toBe('1.4');
      expect(createArg.data.status).toBe(
        MeasurementSheetTemplateStatus.CONCEPT,
      );
      expect(createArg.data.previousVersionId).toBe('t-1');
      expect(mockPrisma.measurementSheetSection.create).toHaveBeenCalled();
      expect(mockPrisma.measurementSheetField.createMany).toHaveBeenCalled();
    });
  });

  // ── Final-check-rules ────────────────────────────────

  describe('updateFinalCheckRules', () => {
    it('replaces rules on a CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
        sections: [],
      });
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({
        id: 't-1',
        finalCheckRules: [{ type: 'allFieldsRequired' }],
      });

      const result = await templatesService.updateFinalCheckRules(
        't-1',
        superuser,
        { rules: [{ type: 'allFieldsRequired' }] },
      );
      expect(result.finalCheckRules).toEqual([{ type: 'allFieldsRequired' }]);
    });

    it('refuses rule edits on a non-CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.ACTIEF,
        sections: [],
      });
      await expect(
        templatesService.updateFinalCheckRules('t-1', superuser, { rules: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Sections ─────────────────────────────────────────

  describe('sections.create', () => {
    it('adds a section to a CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetSection.findFirst.mockResolvedValue(null);
      mockPrisma.measurementSheetSection.aggregate.mockResolvedValue({
        _max: { sortOrder: 2 },
      });
      mockPrisma.measurementSheetSection.create.mockResolvedValue({
        id: 's-1',
        code: 'algemeen',
        sortOrder: 3,
      });
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({});

      const result = await sectionsService.create('t-1', 'super-1', {
        code: 'algemeen',
        name: 'Algemeen',
      });
      expect(result.id).toBe('s-1');
      const arg = mockPrisma.measurementSheetSection.create.mock.calls[0][0];
      expect(arg.data.sortOrder).toBe(3);
    });

    it('rejects a section on a non-CONCEPT template', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.ACTIEF,
      });
      await expect(
        sectionsService.create('t-1', 'super-1', {
          code: 'x',
          name: 'X',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate section code', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetSection.findFirst.mockResolvedValue({
        id: 'dup',
      });
      await expect(
        sectionsService.create('t-1', 'super-1', { code: 'dup', name: 'Dup' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sections.reorder', () => {
    it('reorders sections in a $transaction', async () => {
      mockPrisma.measurementSheetTemplate.findUnique
        .mockResolvedValueOnce({
          id: 't-1',
          status: MeasurementSheetTemplateStatus.CONCEPT,
        })
        // findById reload at the end
        .mockResolvedValueOnce({ id: 't-1', sections: [] });
      mockPrisma.measurementSheetSection.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);
      mockPrisma.measurementSheetSection.update.mockResolvedValue({});
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({});

      await sectionsService.reorder('t-1', 'super-1', ['b', 'a']);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.measurementSheetSection.update).toHaveBeenCalledTimes(2);
    });

    it('rejects an unknown section id', async () => {
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetSection.findMany.mockResolvedValue([
        { id: 'a' },
      ]);
      await expect(
        sectionsService.reorder('t-1', 'super-1', ['ghost']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Fields ───────────────────────────────────────────

  describe('fields.create', () => {
    it('adds a field to a section on a CONCEPT template', async () => {
      mockPrisma.measurementSheetField.findUnique.mockResolvedValue(null);
      mockPrisma.measurementSheetSection.findUnique.mockResolvedValue({
        id: 's-1',
        templateId: 't-1',
        fields: [],
      });
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetField.findFirst.mockResolvedValue(null);
      mockPrisma.measurementSheetField.aggregate.mockResolvedValue({
        _max: { sortOrder: -1 },
      });
      mockPrisma.measurementSheetField.create.mockResolvedValue({
        id: 'f-1',
        code: 'stroom',
      });
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({});

      const result = await fieldsService.create('s-1', 'super-1', {
        code: 'stroom',
        name: 'Stroom',
        fieldType: 'NUMBER' as any,
      });
      expect(result.id).toBe('f-1');
      const arg = mockPrisma.measurementSheetField.create.mock.calls[0][0];
      expect(arg.data.sortOrder).toBe(0);
    });

    it('rejects a DROPDOWN field without options', async () => {
      mockPrisma.measurementSheetSection.findUnique.mockResolvedValue({
        id: 's-1',
        templateId: 't-1',
        fields: [],
      });
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetField.findFirst.mockResolvedValue(null);
      await expect(
        fieldsService.create('s-1', 'super-1', {
          code: 'keuze',
          name: 'Keuze',
          fieldType: 'DROPDOWN' as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects pass/fail on a non-NUMBER field', async () => {
      mockPrisma.measurementSheetSection.findUnique.mockResolvedValue({
        id: 's-1',
        templateId: 't-1',
        fields: [],
      });
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetField.findFirst.mockResolvedValue(null);
      await expect(
        fieldsService.create('s-1', 'super-1', {
          code: 'tekst',
          name: 'Tekst',
          fieldType: 'TEXT' as any,
          passFailEnabled: true,
          passFailOperator: 'GTE' as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('fields.reorder', () => {
    it('reorders fields in a $transaction', async () => {
      mockPrisma.measurementSheetSection.findUnique.mockResolvedValue({
        id: 's-1',
        templateId: 't-1',
        fields: [],
      });
      mockPrisma.measurementSheetTemplate.findUnique.mockResolvedValue({
        id: 't-1',
        status: MeasurementSheetTemplateStatus.CONCEPT,
      });
      mockPrisma.measurementSheetField.findMany.mockResolvedValue([
        { id: 'x' },
        { id: 'y' },
      ]);
      mockPrisma.measurementSheetField.update.mockResolvedValue({});
      mockPrisma.measurementSheetTemplate.update.mockResolvedValue({});

      await fieldsService.reorder('s-1', 'super-1', ['y', 'x']);
      expect(mockPrisma.measurementSheetField.update).toHaveBeenCalledTimes(2);
    });
  });
});
