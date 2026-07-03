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
} from '@/common';
import { LookupService } from '../lookups/lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  };

  const mockLookupService = {
    resolveLookup: jest.fn().mockResolvedValue({ code: 'x' }),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockAssetNodesService = {
    ensureRootNode: jest.fn().mockResolvedValue({ id: 'root-1' }),
    assertValidScopeLocation: jest.fn(),
    resolveDefaultParentForPlan: jest.fn(),
    create: jest.fn(),
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
        { provide: AssetNodesService, useValue: mockAssetNodesService },
        {
          provide: EntitlementsService,
          useValue: { assertFeature: jest.fn().mockResolvedValue(undefined) },
        },
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

      const result = await service.review(
        'plan-1',
        { decision: 'reject' } as any,
        mockUser,
      );

      expect(result.statusCode).toBe(STATUS_REVIEWED);
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.INSPECTIEPLAN_AFGEKEURD,
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
