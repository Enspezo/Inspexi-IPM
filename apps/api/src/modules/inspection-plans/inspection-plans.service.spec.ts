import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, NotificationType } from '@prisma/client';
import { InspectionPlansService } from './inspection-plans.service';
import { PrismaService } from '@/prisma';
import {
  STATUS_DRAFT,
  STATUS_IN_PROGRESS,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
} from '@/common';
import { LookupService } from '../lookups/lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiReviewService } from '../ai-review/ai-review.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';

describe('InspectionPlansService', () => {
  let service: InspectionPlansService;

  const mockPrismaService = {
    inspectionPlan: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    contact: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    location: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    contactPerson: { findUnique: jest.fn() },
    inspectionTemplate: { findUnique: jest.fn() },
    normTypeDefinition: { findUnique: jest.fn() },
    inspectionPlanLocation: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: undefined as unknown as jest.Mock,
  };
  // B-107: create()/update() draaien in een interactieve transactie; de
  // callback krijgt in de test gewoon dezelfde mock als tx-client. (Buiten het
  // object-literal gezet om een circulaire type-inferentie te vermijden.)
  mockPrismaService.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof mockPrismaService) => unknown)(mockPrismaService)
      : Promise.all(arg as Promise<unknown>[]),
  );

  const mockLookupService = {
    resolveLookup: jest.fn().mockResolvedValue({ code: 'x' }),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockAiReviewService = {
    startRun: jest.fn(),
  };

  const mockAssetNodesService = {
    ensureRootNode: jest.fn().mockResolvedValue({ id: 'root-1' }),
    assertValidScopeLocation: jest.fn(),
    resolveDefaultParentForPlan: jest.fn(),
    create: jest.fn(),
  };

  const mockEntitlementsService = {
    assertFeature: jest.fn(),
    getEnabledFeatures: jest.fn(),
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

    mockAssetNodesService.ensureRootNode.mockResolvedValue({ id: 'root-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionPlansService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LookupService, useValue: mockLookupService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AiReviewService, useValue: mockAiReviewService },
        { provide: AssetNodesService, useValue: mockAssetNodesService },
        { provide: EntitlementsService, useValue: mockEntitlementsService },
      ],
    }).compile();

    service = module.get<InspectionPlansService>(InspectionPlansService);

    // Default lookup resolves to a valid row
    mockLookupService.resolveLookup.mockResolvedValue({ code: 'x' });

    // Default FK-ownership checks resolve to the same org as mockUser
    mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.project.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.location.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.contactPerson.findUnique.mockResolvedValue({
      orgId: 'org-1',
    });
    mockPrismaService.inspectionTemplate.findUnique.mockResolvedValue({
      orgId: 'org-1',
    });
    mockPrismaService.normTypeDefinition.findUnique.mockResolvedValue({
      isActive: true,
    });
    mockPrismaService.organization.findUnique.mockResolvedValue({
      inspectionReviewEnabled: true,
    });
    mockAiReviewService.startRun.mockResolvedValue({ id: 'run-1' });
    mockEntitlementsService.assertFeature.mockResolvedValue(undefined);
    mockEntitlementsService.getEnabledFeatures.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('should return paginated plans for org user', async () => {
      const mockPlans = [
        { id: 'plan-1', projectName: 'Test', orgId: 'org-1' },
      ];
      mockPrismaService.inspectionPlan.findMany.mockResolvedValue(mockPlans);
      mockPrismaService.inspectionPlan.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, {
        page: 1,
        limit: 20,
      } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.inspectionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', deletedAt: null }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.inspectionPlan.findMany.mockResolvedValue([]);
      mockPrismaService.inspectionPlan.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 } as any);

      const call = mockPrismaService.inspectionPlan.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by onlyMine', async () => {
      mockPrismaService.inspectionPlan.findMany.mockResolvedValue([]);
      mockPrismaService.inspectionPlan.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        onlyMine: 'true',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.inspectionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedTo: 'user-1' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a plan for the owning org', async () => {
      const mockPlan = { id: 'plan-1', orgId: 'org-1', projectName: 'Test' };
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(mockPlan);

      const result = await service.findOne('plan-1', mockUser);

      expect(result.id).toBe('plan-1');
    });

    it('should throw NotFoundException for missing plan (NL message)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        'Inspectieplan niet gevonden',
      );
    });

    it('should scope the query to the user org → cross-org plan yields 404', async () => {
      // Cross-tenant reads are org-scoped in the query itself: another org's
      // plan falls outside the filter and surfaces as NotFound (404), so we
      // never disclose that the record exists (consistent with assets/findings).
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(service.findOne('plan-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'plan-1',
            orgId: 'org-1',
            deletedAt: null,
          }),
        }),
      );
    });

    it('should allow SUPERUSER cross-org access', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'other-org',
      });

      const result = await service.findOne('plan-1', mockSuperuser);

      expect(result.id).toBe('plan-1');
    });
  });

  describe('create', () => {
    it('should create a plan with draft status and createdBy', async () => {
      const mockPlan = {
        id: 'plan-new',
        orgId: 'org-1',
        projectName: 'New Plan',
        statusCode: STATUS_DRAFT,
        assignedTo: null,
      };
      mockPrismaService.inspectionPlan.create.mockResolvedValue(mockPlan);

      const result = await service.create(
        { contactId: 'c-1', projectName: 'New Plan', normTypeCode: 'NEN1010' } as any,
        mockUser,
      );

      expect(result.id).toBe('plan-new');
      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusCode: STATUS_DRAFT,
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('should dispatch INSPECTIEPLAN_TOEGEWEZEN when assignedTo set', async () => {
      const mockPlan = {
        id: 'plan-new',
        orgId: 'org-1',
        projectName: 'Assigned Plan',
        statusCode: STATUS_DRAFT,
        assignedTo: 'user-2',
      };
      mockPrismaService.inspectionPlan.create.mockResolvedValue(mockPlan);

      await service.create(
        {
          contactId: 'c-1',
          projectName: 'Assigned Plan',
          normTypeCode: 'NEN1010',
          assignedTo: 'user-2',
        } as any,
        mockUser,
      );

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_TOEGEWEZEN,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    it('should NOT dispatch when assigned to self', async () => {
      const mockPlan = {
        id: 'plan-new',
        orgId: 'org-1',
        projectName: 'Self Plan',
        statusCode: STATUS_DRAFT,
        assignedTo: 'user-1',
      };
      mockPrismaService.inspectionPlan.create.mockResolvedValue(mockPlan);

      await service.create(
        {
          contactId: 'c-1',
          projectName: 'Self Plan',
          normTypeCode: 'NEN1010',
          assignedTo: 'user-1',
        } as any,
        mockUser,
      );

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should reject cross-org contact', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue({
        orgId: 'other-org',
      });

      await expect(
        service.create(
          { contactId: 'c-1', projectName: 'X', normTypeCode: 'NEN1010' } as any,
          mockUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    // ── B-107: afgewezen create mag geen weesplan achterlaten ──
    it('B-107: valideert scope-locaties VÓÓR de write — bij afkeuring wordt het plan nooit aangemaakt', async () => {
      mockAssetNodesService.assertValidScopeLocation.mockRejectedValue(
        new NotFoundException('Scope-locatie niet gevonden'),
      );

      await expect(
        service.create(
          {
            contactId: 'c-1',
            projectName: 'SEC08 scope-injectie',
            normTypeCode: 'NEN1010',
            locationId: 'loc-1',
            scopeLocationIds: ['vreemde-node'],
          } as any,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);

      // De kern van B-107: géén plan-create, géén scope-write.
      expect(mockPrismaService.inspectionPlan.create).not.toHaveBeenCalled();
      expect(mockPrismaService.inspectionPlanLocation.create).not.toHaveBeenCalled();
    });

    it('B-107: scopeLocationIds zonder locationId → 400 vóór élke write', async () => {
      await expect(
        service.create(
          {
            contactId: 'c-1',
            projectName: 'X',
            normTypeCode: 'NEN1010',
            scopeLocationIds: ['node-1'],
          } as any,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.inspectionPlan.create).not.toHaveBeenCalled();
    });

    it('B-107: plan + scope-rijen worden binnen één $transaction geschreven', async () => {
      const mockPlan = {
        id: 'plan-new',
        orgId: 'org-1',
        projectName: 'Met scope',
        statusCode: STATUS_DRAFT,
        locationId: 'loc-1',
        assignedTo: null,
      };
      mockPrismaService.inspectionPlan.create.mockResolvedValue(mockPlan);
      mockAssetNodesService.assertValidScopeLocation.mockResolvedValue(undefined);

      await service.create(
        {
          contactId: 'c-1',
          projectName: 'Met scope',
          normTypeCode: 'NEN1010',
          locationId: 'loc-1',
          scopeLocationIds: ['node-1', 'node-2'],
        } as any,
        mockUser,
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inspectionPlanLocation.create).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.inspectionPlanLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assetNodeId: 'node-1', isPrimary: true }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should set statusCode when provided and valid', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_IN_PROGRESS,
      });

      const result = await service.update(
        'plan-1',
        { statusCode: STATUS_IN_PROGRESS } as any,
        mockUser,
      );

      expect(result.statusCode).toBe(STATUS_IN_PROGRESS);
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusCode: STATUS_IN_PROGRESS }),
        }),
      );
    });

    it('should throw BadRequest for unknown statusCode', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: null,
      });
      // statusCode lookup returns null → unknown status
      mockLookupService.resolveLookup.mockResolvedValue(null);

      await expect(
        service.update('plan-1', { statusCode: 'bogus' } as any, mockUser),
      ).rejects.toThrow('Onbekende planstatus: bogus');
    });

    it('should dispatch INSPECTIEPLAN_TOEGEWEZEN when assignee changes', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: 'user-2',
      });

      await service.update('plan-1', { assignedTo: 'user-2' } as any, mockUser);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_TOEGEWEZEN,
          recipientUserIds: ['user-2'],
        }),
      );
    });
  });

  describe('create — online herstel default (PRD-14)', () => {
    // Review #4: de org-default zet de vlag alleen aan bij een gevuld én binnen
    // de org uniek rapportnummer — anders blijft hij stil uit (geen throw).
    const createDto = {
      contactId: 'c-1',
      projectName: 'Plan',
      normTypeCode: 'NEN1010',
      referenceNumber: 'RAP-NIEUW',
    } as any;

    beforeEach(() => {
      mockPrismaService.inspectionPlan.create.mockResolvedValue({
        id: 'plan-new',
        orgId: 'org-1',
        projectName: 'Plan',
        assignedTo: null,
        locationId: null,
      });
    });

    it('zet onlineRepairEnabled aan bij org-default + entitlement + gevuld uniek rapportnummer', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: true,
      });
      mockEntitlementsService.getEnabledFeatures.mockResolvedValue(['ONLINE_HERSTEL']);
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null); // geen duplicaat

      await service.create(createDto, mockUser);

      // Duplicaat-check: getrimd + case-insensitief binnen de org.
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            deletedAt: null,
            referenceNumber: { equals: 'RAP-NIEUW', mode: 'insensitive' },
          },
          select: { id: true },
        }),
      );
      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: true }),
        }),
      );
    });

    it('blijft stil false zonder rapportnummer (org-default + entitlement, geen throw)', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: true,
      });
      mockEntitlementsService.getEnabledFeatures.mockResolvedValue(['ONLINE_HERSTEL']);

      await service.create({ ...createDto, referenceNumber: undefined }, mockUser);

      // Zonder ref geen duplicaat-query en geen fout — de vlag blijft gewoon uit.
      expect(mockPrismaService.inspectionPlan.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            onlineRepairEnabled: false,
            referenceNumber: null,
          }),
        }),
      );
    });

    it('blijft stil false bij een duplicaat-rapportnummer (org-default + entitlement)', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: true,
      });
      mockEntitlementsService.getEnabledFeatures.mockResolvedValue(['ONLINE_HERSTEL']);
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({ id: 'ander-plan' });

      await service.create(createDto, mockUser);

      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: false }),
        }),
      );
    });

    it('slaat het rapportnummer getrimd op en checkt het duplicaat getrimd (review #10)', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: true,
      });
      mockEntitlementsService.getEnabledFeatures.mockResolvedValue(['ONLINE_HERSTEL']);
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(null);

      await service.create({ ...createDto, referenceNumber: ' REF-1 ' }, mockUser);

      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            referenceNumber: { equals: 'REF-1', mode: 'insensitive' },
          }),
        }),
      );
      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            onlineRepairEnabled: true,
            referenceNumber: 'REF-1',
          }),
        }),
      );
    });

    it('blijft false bij org-default aan maar zonder entitlement', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: true,
      });
      mockEntitlementsService.getEnabledFeatures.mockResolvedValue(['ANDERE_FEATURE']);

      await service.create(createDto, mockUser);

      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: false }),
        }),
      );
    });

    it('blijft false (zonder entitlement-lookup) wanneer de org-default uit staat', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        onlineRepairDefault: false,
      });

      await service.create(createDto, mockUser);

      expect(mockEntitlementsService.getEnabledFeatures).not.toHaveBeenCalled();
      expect(mockPrismaService.inspectionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: false }),
        }),
      );
    });
  });

  // ── B-313: inspectionTemplateId werd gevalideerd maar nooit gemapt ──
  describe('update — inspectionTemplateId (B-313)', () => {
    beforeEach(() => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: null,
        locationId: null,
        projectId: null,
        onlineRepairEnabled: false,
        referenceNumber: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
      });
    });

    it('koppelt de template daadwerkelijk (connect) — geen stille no-op meer', async () => {
      await service.update(
        'plan-1',
        { inspectionTemplateId: 'tpl-1' } as any,
        mockUser,
      );

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inspectionTemplate: { connect: { id: 'tpl-1' } },
          }),
        }),
      );
    });

    it('ontkoppelt met null (disconnect)', async () => {
      await service.update(
        'plan-1',
        { inspectionTemplateId: null } as any,
        mockUser,
      );

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inspectionTemplate: { disconnect: true },
          }),
        }),
      );
    });

    /**
     * Generiek vangnet (advies B-313): elk veld van UpdateInspectionPlanDto
     * moet in de Prisma-write belanden óf expliciet in de uitsluitlijst staan
     * (met de reden waarom het buiten `data` om gaat). Een nieuw DTO-veld dat
     * vergeten wordt te mappen laat deze test direct falen — precies de stille
     * no-op-klasse van B-313.
     */
    it('DTO↔mapping-regressie: elk DTO-veld belandt in de write of is expliciet uitgesloten', async () => {
      // Velden die bewust NIET (direct) in `data` terechtkomen:
      const EXCLUDED: Record<string, string> = {
        scopeLocationIds: 'geschreven via inspectionPlanLocation-rijen in dezelfde transactie',
      };

      const fullDto: Record<string, unknown> = {
        contactId: 'c-1',
        projectId: 'p-1',
        locationId: 'loc-1',
        scopeLocationIds: ['node-1'],
        inspectionTemplateId: 'tpl-1',
        projectName: 'Alles gezet',
        description: 'desc',
        referenceNumber: 'REF-1',
        normTypeCode: 'NEN1010',
        inspectionTypeCode: 'initial',
        addressStreet: 'Straat',
        addressHouseNumber: '1',
        addressPostalCode: '1234AB',
        addressCity: 'Stad',
        gpsLatitude: 52.1,
        gpsLongitude: 4.9,
        plannedDate: '2026-08-01',
        deadline: '2026-09-01',
        assignedTo: 'user-2',
        reviewerId: 'user-3',
        installationResponsibleId: 'cp-1',
        notes: 'noot',
        statusCode: STATUS_IN_PROGRESS,
        startedAt: '2026-08-01T08:00:00Z',
        internalNotes: 'intern',
        projectPhaseId: null,
        metadata: { vrij: 'veld' },
        onlineRepairEnabled: false,
      };

      // Map DTO-veld → sleutel in het Prisma-`data`-object (relaties wijken af).
      const DATA_KEY: Record<string, string> = {
        contactId: 'contact',
        projectId: 'project',
        locationId: 'location',
        inspectionTemplateId: 'inspectionTemplate',
        assignedTo: 'assignedUser',
        reviewerId: 'reviewer',
        installationResponsibleId: 'installationResponsible',
        projectPhaseId: 'projectPhase',
      };

      await service.update('plan-1', fullDto as any, mockUser);

      const updateCall = mockPrismaService.inspectionPlan.update.mock.calls.at(-1)![0];
      const dataKeys = Object.keys(updateCall.data);

      const missing = Object.keys(fullDto)
        .filter((key) => !(key in EXCLUDED))
        .filter((key) => !dataKeys.includes(DATA_KEY[key] ?? key));

      expect(missing).toEqual([]);
    });
  });

  describe('update — online herstel (PRD-14)', () => {
    const existingPlan = (referenceNumber: string | null, onlineRepairEnabled = false) => ({
      id: 'plan-1',
      orgId: 'org-1',
      projectName: 'Test',
      assignedTo: null,
      projectId: null,
      locationId: null,
      referenceNumber,
      onlineRepairEnabled,
    });

    beforeEach(() => {
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        assignedTo: null,
      });
    });

    it('weigert aanzetten zonder gevuld rapportnummer', async () => {
      // De validatie faalt vóór de duplicaat-query, dus een vaste findFirst-mock volstaat.
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(existingPlan(null));

      await expect(
        service.update('plan-1', { onlineRepairEnabled: true } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('plan-1', { onlineRepairEnabled: true } as any, mockUser),
      ).rejects.toThrow(/rapportnummer/);
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('weigert aanzetten met een binnen de org al gebruikt rapportnummer', async () => {
      mockPrismaService.inspectionPlan.findFirst
        .mockResolvedValueOnce(existingPlan('RAP-1')) // findOne
        .mockResolvedValueOnce({ id: 'ander-plan' }); // duplicaat-check

      await expect(
        service.update('plan-1', { onlineRepairEnabled: true } as any, mockUser),
      ).rejects.toThrow(/al in gebruik/);
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('zet de vlag aan bij een gevuld en uniek rapportnummer (case-insensitieve check)', async () => {
      mockPrismaService.inspectionPlan.findFirst
        .mockResolvedValueOnce(existingPlan('RAP-1')) // findOne
        .mockResolvedValueOnce(null); // geen duplicaat

      await service.update('plan-1', { onlineRepairEnabled: true } as any, mockUser);

      // Duplicaat-query: eigen plan uitgesloten, getrimd + case-insensitief.
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            deletedAt: null,
            id: { not: 'plan-1' },
            referenceNumber: { equals: 'RAP-1', mode: 'insensitive' },
          },
          select: { id: true },
        }),
      );
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: true }),
        }),
      );
    });

    it('gebruikt het in dezelfde PATCH meegegeven rapportnummer voor de validatie', async () => {
      mockPrismaService.inspectionPlan.findFirst
        .mockResolvedValueOnce(existingPlan(null)) // findOne: nog geen ref
        .mockResolvedValueOnce(null); // geen duplicaat voor NEW-1

      await service.update(
        'plan-1',
        { onlineRepairEnabled: true, referenceNumber: 'NEW-1' } as any,
        mockUser,
      );

      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            referenceNumber: { equals: 'NEW-1', mode: 'insensitive' },
          }),
        }),
      );
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            onlineRepairEnabled: true,
            referenceNumber: 'NEW-1',
          }),
        }),
      );
    });

    it('uitzetten valideert het rapportnummer niet en zet false', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValueOnce(existingPlan(null));

      await service.update('plan-1', { onlineRepairEnabled: false } as any, mockUser);

      // Alleen de findOne-call — geen duplicaat-check.
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onlineRepairEnabled: false }),
        }),
      );
    });

    // Review #3: de invariant geldt ook andersom — zolang de vlag (effectief)
    // aan staat mag het rapportnummer niet geleegd of gedupliceerd worden.
    it('weigert een duplicaat-rapportnummer op een plan met de vlag al aan (alleen ref-wijziging)', async () => {
      mockPrismaService.inspectionPlan.findFirst
        .mockResolvedValueOnce(existingPlan('RAP-1', true)) // findOne: vlag staat aan
        .mockResolvedValueOnce({ id: 'ander-plan' }); // duplicaat voor RAP-9

      await expect(
        service.update('plan-1', { referenceNumber: 'RAP-9' } as any, mockUser),
      ).rejects.toThrow(/al in gebruik/);
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('weigert het legen van het rapportnummer zolang de vlag aan staat', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValueOnce(
        existingPlan('RAP-1', true),
      );

      await expect(
        service.update('plan-1', { referenceNumber: '' } as any, mockUser),
      ).rejects.toThrow(/vul dit eerst in/);
      // Lege ref faalt vóór de duplicaat-query: alleen de findOne-call.
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('valideert niet bij een ref-wijziging terwijl de vlag uit staat en blijft', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValueOnce(
        existingPlan('RAP-1', false),
      );

      await service.update('plan-1', { referenceNumber: 'RAP-9' } as any, mockUser);

      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referenceNumber: 'RAP-9' }),
        }),
      );
    });

    it('vlag uit + ref legen in één PATCH → geen validatie, referenceNumber null', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValueOnce(
        existingPlan('RAP-1', true),
      );

      await service.update(
        'plan-1',
        { onlineRepairEnabled: false, referenceNumber: '' } as any,
        mockUser,
      );

      // dto.onlineRepairEnabled=false wint van de bestaande vlag → geen gate.
      expect(mockPrismaService.inspectionPlan.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            onlineRepairEnabled: false,
            referenceNumber: null,
          }),
        }),
      );
    });

    it('slaat het rapportnummer getrimd op (review #10)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValueOnce(
        existingPlan(null, false),
      );

      await service.update('plan-1', { referenceNumber: '  NEW-2  ' } as any, mockUser);

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referenceNumber: 'NEW-2' }),
        }),
      );
    });
  });

  describe('update — vier-ogen-gate (PRD-13)', () => {
    const basePlan = {
      id: 'plan-1',
      orgId: 'org-1',
      projectName: 'Test',
      assignedTo: null,
      reviewedAt: null,
    };

    beforeEach(() => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(basePlan);
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        ...basePlan,
        statusCode: STATUS_COMPLETED,
      });
    });

    it('weigert completed zonder review wanneer de org-toggle aan staat', async () => {
      await expect(
        service.update('plan-1', { statusCode: STATUS_COMPLETED } as any, mockUser),
      ).rejects.toThrow('Dit plan moet eerst beoordeeld worden (vier-ogen-principe)');
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('weigert ook approved zonder review', async () => {
      await expect(
        service.update('plan-1', { statusCode: STATUS_APPROVED } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('staat completed toe wanneer de org-toggle uit staat', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({
        inspectionReviewEnabled: false,
      });

      await service.update('plan-1', { statusCode: STATUS_COMPLETED } as any, mockUser);

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusCode: STATUS_COMPLETED }),
        }),
      );
    });

    it('staat completed toe wanneer het plan al beoordeeld is (reviewedAt gezet)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        ...basePlan,
        reviewedAt: new Date('2026-07-01'),
      });

      await service.update('plan-1', { statusCode: STATUS_COMPLETED } as any, mockUser);

      // reviewedAt gevuld → gate slaat de org-lookup helemaal over.
      expect(mockPrismaService.organization.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalled();
    });

    it('checkt de org-vlag niet voor andere statustransities', async () => {
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        ...basePlan,
        statusCode: STATUS_IN_PROGRESS,
      });

      await service.update('plan-1', { statusCode: STATUS_IN_PROGRESS } as any, mockUser);

      expect(mockPrismaService.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('should throw BadRequest when not in_progress', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_DRAFT,
      });

      await expect(
        service.submit('plan-1', {} as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update to pending_review and dispatch TER_REVIEW from in_progress', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_IN_PROGRESS,
        reviewerId: 'user-2',
        internalNotes: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_PENDING_REVIEW,
      });

      const result = await service.submit('plan-1', {} as any, mockUser);

      expect(result.statusCode).toBe(STATUS_PENDING_REVIEW);
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusCode: STATUS_PENDING_REVIEW }),
        }),
      );
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_TER_REVIEW,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    describe('AI-review-hook (PRD-13, fire-and-forget)', () => {
      const inProgressPlan = {
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_IN_PROGRESS,
        reviewerId: 'user-2',
        internalNotes: null,
      };

      beforeEach(() => {
        mockPrismaService.inspectionPlan.findFirst.mockResolvedValue(inProgressPlan);
        mockPrismaService.inspectionPlan.update.mockResolvedValue({
          ...inProgressPlan,
          statusCode: STATUS_PENDING_REVIEW,
        });
      });

      it('start een AI-run na een geslaagde submit (guards zitten in startRun)', async () => {
        await service.submit('plan-1', {} as any, mockUser);

        expect(mockAiReviewService.startRun).toHaveBeenCalledWith('plan-1', mockUser);
      });

      it('laat de submit slagen wanneer startRun weigert (entitlement/toggle/key uit → HttpException)', async () => {
        // Representatief voor alle guard-weigeringen in startRun: 403 (geen
        // AI_REVIEW-entitlement), 400 (org-toggle uit), 503 (geen API-key), 409.
        mockAiReviewService.startRun.mockRejectedValue(
          new ForbiddenException('AI-rapportcontrole zit niet in uw abonnement'),
        );

        const result = await service.submit('plan-1', {} as any, mockUser);

        expect(result.statusCode).toBe(STATUS_PENDING_REVIEW);
        expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
          expect.objectContaining({ type: NotificationType.INSPECTIEPLAN_TER_REVIEW }),
        );
      });

      it('laat de submit slagen bij een onverwachte fout uit startRun', async () => {
        mockAiReviewService.startRun.mockRejectedValue(new Error('db weg'));

        await expect(service.submit('plan-1', {} as any, mockUser)).resolves.toMatchObject({
          statusCode: STATUS_PENDING_REVIEW,
        });
      });

      it('start GEEN run wanneer de submit zelf faalt (verkeerde status)', async () => {
        mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
          ...inProgressPlan,
          statusCode: STATUS_DRAFT,
        });

        await expect(service.submit('plan-1', {} as any, mockUser)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockAiReviewService.startRun).not.toHaveBeenCalled();
      });
    });
  });

  describe('review', () => {
    it('should throw BadRequest when not pending_review', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_IN_PROGRESS,
      });

      await expect(
        service.review('plan-1', { decision: 'approve' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set approved and dispatch GOEDGEKEURD on approve', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_PENDING_REVIEW,
        assignedTo: 'user-2',
        createdBy: 'user-3',
        internalNotes: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_APPROVED,
        assignedTo: 'user-2',
        createdBy: 'user-3',
      });

      const result = await service.review(
        'plan-1',
        { decision: 'approve' } as any,
        mockUser,
      );

      expect(result.statusCode).toBe(STATUS_APPROVED);
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_GOEDGEKEURD,
          recipientUserIds: expect.arrayContaining(['user-2', 'user-3']),
        }),
      );
    });

    it('should set reviewed and dispatch AFGEKEURD on reject', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_PENDING_REVIEW,
        assignedTo: 'user-2',
        createdBy: 'user-3',
        internalNotes: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_REVIEWED,
        assignedTo: 'user-2',
        createdBy: 'user-3',
      });

      // B-315 §8: afkeuren vereist een toelichting.
      const result = await service.review(
        'plan-1',
        { decision: 'reject', notes: 'Meetstaat sectie 2 is onvolledig' } as any,
        mockUser,
      );

      expect(result.statusCode).toBe(STATUS_REVIEWED);
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_AFGEKEURD,
        }),
      );
      // B-315 §9: de daadwerkelijke beoordelaar wordt op het plan vastgelegd.
      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewer: { connect: { id: mockUser.id } },
          }),
        }),
      );
    });

    // ── B-315 §8: afkeuren zonder toelichting wordt geweigerd ──
    it('B-315 §8: reject zonder notes → 400 met NL-melding', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_PENDING_REVIEW,
        assignedTo: 'user-2',
        createdBy: 'user-3',
        internalNotes: null,
      });

      await expect(
        service.review('plan-1', { decision: 'reject' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.review('plan-1', { decision: 'reject', notes: '   ' } as any, mockUser),
      ).rejects.toThrow('Geef een toelichting bij het afkeuren');
      expect(mockPrismaService.inspectionPlan.update).not.toHaveBeenCalled();
    });

    it('B-315 §9: ook bij goedkeuren wordt de beoordelaar vastgelegd (zonder verplichte notes)', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_PENDING_REVIEW,
        assignedTo: 'user-2',
        createdBy: 'user-3',
        internalNotes: null,
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
        statusCode: STATUS_APPROVED,
      });

      await service.review('plan-1', { decision: 'approve' } as any, mockUser);

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusCode: STATUS_APPROVED,
            reviewer: { connect: { id: mockUser.id } },
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should soft-delete via deletedAt', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        projectName: 'Test',
      });
      mockPrismaService.inspectionPlan.update.mockResolvedValue({});

      await service.remove('plan-1', mockUser);

      expect(mockPrismaService.inspectionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
