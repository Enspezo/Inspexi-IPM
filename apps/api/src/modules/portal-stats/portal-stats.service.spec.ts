import { Test, TestingModule } from '@nestjs/testing';
import { Role, User } from '@prisma/client';
import { PortalStatsService } from './portal-stats.service';
import { PrismaService } from '@/prisma';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { STATUS_PENDING_REVIEW, STATUS_APPROVED, STATUS_OPEN } from '@/common';

describe('PortalStatsService', () => {
  let service: PortalStatsService;

  const mockPrismaService = {
    inspectionPlan: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    finding: {
      count: jest.fn(),
    },
    // Unified asset tree: assets (nodeType ASSET) en locaties (nodeType LOCATION)
    // worden beide via assetNode.count geteld (asset-call eerst, dan locatie-call).
    assetNode: {
      count: jest.fn(),
    },
    contact: {
      findMany: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    generatedDocument: {
      count: jest.fn(),
    },
  };

  const mockEntitlements = {
    getEnabledFeatures: jest.fn(),
  };

  const orgUser = {
    id: 'user-1',
    orgId: 'org-1',
    roles: [Role.ORG_ADMIN],
  } as unknown as User;

  const superUser = {
    id: 'su-1',
    orgId: null,
    roles: [Role.SUPERUSER],
  } as unknown as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalStatsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EntitlementsService, useValue: mockEntitlements },
      ],
    }).compile();

    service = module.get<PortalStatsService>(PortalStatsService);

    // Sensible numeric defaults so aggregations resolve.
    mockPrismaService.inspectionPlan.count.mockResolvedValue(0);
    mockPrismaService.finding.count.mockResolvedValue(0);
    mockPrismaService.assetNode.count.mockResolvedValue(0);
    mockPrismaService.inspectionPlan.findMany.mockResolvedValue([]);
    mockPrismaService.contact.findMany.mockResolvedValue([]);
    mockPrismaService.user.count.mockResolvedValue(0);
    mockPrismaService.generatedDocument.count.mockResolvedValue(0);
    mockEntitlements.getEnabledFeatures.mockResolvedValue(['BASIS_INSPECTIES']);
  });

  // ── B-001: KPI-tegels staf-dashboard ──
  describe('getStaffDashboardStats (B-001)', () => {
    it('telt actieve inspecties, actieve gebruikers en rapporten org-scoped', async () => {
      mockPrismaService.user.count.mockResolvedValue(7);
      mockPrismaService.inspectionPlan.count.mockResolvedValue(4);
      mockPrismaService.generatedDocument.count.mockResolvedValue(3);

      const result = await service.getStaffDashboardStats(orgUser);

      expect(result).toEqual({ activeInspections: 4, activeUsers: 7, reports: 3 });
      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: { orgId: 'org-1', isActive: true },
      });
      // "Actief" = nog niet approved/completed/cancelled, niet soft-deleted.
      expect(mockPrismaService.inspectionPlan.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          orgId: 'org-1',
          deletedAt: null,
          statusCode: { notIn: [STATUS_APPROVED, 'completed', 'cancelled'] },
        }),
      });
    });

    it('geeft null voor inspectie-tellingen zonder BASIS_INSPECTIES (zelfde gating als sidebar)', async () => {
      mockEntitlements.getEnabledFeatures.mockResolvedValue(['BASIS_CRM']);
      mockPrismaService.user.count.mockResolvedValue(2);

      const result = await service.getStaffDashboardStats(orgUser);

      expect(result).toEqual({ activeInspections: null, activeUsers: 2, reports: null });
      expect(mockPrismaService.inspectionPlan.count).not.toHaveBeenCalled();
      expect(mockPrismaService.generatedDocument.count).not.toHaveBeenCalled();
    });

    it('SUPERUSER (orgId null) telt over alle orgs en heeft impliciet alle features', async () => {
      mockPrismaService.user.count.mockResolvedValue(19);
      mockPrismaService.inspectionPlan.count.mockResolvedValue(12);
      mockPrismaService.generatedDocument.count.mockResolvedValue(6);

      const result = await service.getStaffDashboardStats(superUser);

      expect(result.activeUsers).toBe(19);
      expect(result.activeInspections).toBe(12);
      expect(mockEntitlements.getEnabledFeatures).not.toHaveBeenCalled();
      expect(mockPrismaService.user.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });
  });

  describe('getDashboardStats', () => {
    it('returns the expected shape with all summary keys', async () => {
      mockPrismaService.inspectionPlan.count
        .mockResolvedValueOnce(5) // totalThisMonth
        .mockResolvedValueOnce(2) // pendingReview
        .mockResolvedValueOnce(1); // completedThisWeek
      mockPrismaService.finding.count.mockResolvedValueOnce(3); // criticalFindings
      mockPrismaService.assetNode.count
        .mockResolvedValueOnce(7) // totalAssets (nodeType ASSET)
        .mockResolvedValueOnce(4); // totalLocations (nodeType LOCATION)

      const result = await service.getDashboardStats(orgUser);

      expect(result).toEqual({
        totalThisMonth: 5,
        pendingReview: 2,
        completedThisWeek: 1,
        criticalFindings: 3,
        totalAssets: 7,
        totalLocations: 4,
      });
    });

    it('scopes every count to the org for an org user (orgId in where)', async () => {
      await service.getDashboardStats(orgUser);

      for (const call of mockPrismaService.inspectionPlan.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ orgId: 'org-1' }),
        );
      }
      expect(mockPrismaService.finding.count.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ orgId: 'org-1' }),
      );
      for (const call of mockPrismaService.assetNode.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ orgId: 'org-1' }),
        );
      }
    });

    it('does NOT apply an orgId filter for a superuser', async () => {
      await service.getDashboardStats(superUser);

      for (const call of mockPrismaService.inspectionPlan.count.mock.calls) {
        expect(call[0].where).not.toHaveProperty('orgId');
      }
      expect(
        mockPrismaService.finding.count.mock.calls[0][0].where,
      ).not.toHaveProperty('orgId');
      for (const call of mockPrismaService.assetNode.count.mock.calls) {
        expect(call[0].where).not.toHaveProperty('orgId');
      }
    });

    it('counts critical findings as open findings', async () => {
      await service.getDashboardStats(orgUser);

      expect(mockPrismaService.finding.count.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ statusCode: STATUS_OPEN, deletedAt: null }),
      );
    });
  });

  describe('getInspectionsChart', () => {
    it('returns 8 weekly data points with week + count keys', async () => {
      mockPrismaService.inspectionPlan.count.mockResolvedValue(1);

      const result = await service.getInspectionsChart(orgUser);

      expect(result).toHaveLength(8);
      for (const point of result) {
        expect(point).toEqual(
          expect.objectContaining({
            week: expect.stringMatching(/^Week \d+$/),
            count: 1,
          }),
        );
      }
      expect(mockPrismaService.inspectionPlan.count).toHaveBeenCalledTimes(8);
    });

    it('scopes each weekly count to the org', async () => {
      await service.getInspectionsChart(orgUser);

      for (const call of mockPrismaService.inspectionPlan.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ orgId: 'org-1', deletedAt: null }),
        );
      }
    });

    it('does NOT apply an orgId filter for a superuser', async () => {
      await service.getInspectionsChart(superUser);

      for (const call of mockPrismaService.inspectionPlan.count.mock.calls) {
        expect(call[0].where).not.toHaveProperty('orgId');
      }
    });
  });

  describe('getRecentActivities', () => {
    it('maps plans and contacts into activity items and sorts by timestamp desc', async () => {
      mockPrismaService.inspectionPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          statusCode: STATUS_PENDING_REVIEW,
          normTypeCode: 'scope8',
          projectName: 'Plan A',
          updatedAt: new Date('2026-06-10T10:00:00Z'),
          assignedUser: { firstName: 'Jan', lastName: 'Jansen' },
          contact: { companyName: 'Acme BV', firstName: null, lastName: null },
        },
        {
          id: 'plan-2',
          statusCode: STATUS_APPROVED,
          normTypeCode: 'scope10',
          projectName: 'Plan B',
          updatedAt: new Date('2026-06-12T10:00:00Z'),
          assignedUser: null,
          contact: null,
        },
      ]);
      mockPrismaService.contact.findMany.mockResolvedValue([
        {
          id: 'c-1',
          companyName: null,
          firstName: 'Piet',
          lastName: 'Pietersen',
          createdAt: new Date('2026-06-13T10:00:00Z'),
        },
      ]);

      const result = await service.getRecentActivities(orgUser);

      expect(result).toHaveLength(3);
      // Sorted newest-first.
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'contact-c-1',
          type: 'contact_created',
          title: 'Nieuwe klant aangemaakt',
          description: 'Piet Pietersen',
          user: 'Systeem',
        }),
      );
      // Submitted plan with company-name contact + assigned user name.
      const submitted = result.find((a) => a.id === 'plan-1');
      expect(submitted).toEqual(
        expect.objectContaining({
          type: 'inspection_submitted',
          title: 'Inspectie ingediend',
          description: 'scope8 inspectie voor Acme BV',
          user: 'Jan Jansen',
        }),
      );
      // Approved plan, no assigned user, no contact → falls back to projectName.
      const approved = result.find((a) => a.id === 'plan-2');
      expect(approved).toEqual(
        expect.objectContaining({
          type: 'inspection_approved',
          title: 'Inspectie goedgekeurd',
          description: 'scope10 inspectie voor Plan B',
          user: 'Onbekend',
        }),
      );
    });

    it('limits the result to 10 items', async () => {
      const plans = Array.from({ length: 10 }, (_, i) => ({
        id: `plan-${i}`,
        statusCode: STATUS_PENDING_REVIEW,
        normTypeCode: 'scope8',
        projectName: `Plan ${i}`,
        updatedAt: new Date(2026, 5, i + 1),
        assignedUser: null,
        contact: null,
      }));
      const contacts = Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`,
        companyName: `Bedrijf ${i}`,
        firstName: null,
        lastName: null,
        createdAt: new Date(2026, 4, i + 1),
      }));
      mockPrismaService.inspectionPlan.findMany.mockResolvedValue(plans);
      mockPrismaService.contact.findMany.mockResolvedValue(contacts);

      const result = await service.getRecentActivities(orgUser);

      expect(result).toHaveLength(10);
    });

    it('scopes plans and contacts to the org', async () => {
      await service.getRecentActivities(orgUser);

      expect(
        mockPrismaService.inspectionPlan.findMany.mock.calls[0][0].where,
      ).toEqual(expect.objectContaining({ orgId: 'org-1', deletedAt: null }));
      expect(
        mockPrismaService.contact.findMany.mock.calls[0][0].where,
      ).toEqual(expect.objectContaining({ orgId: 'org-1', isDeleted: false }));
    });

    it('does NOT apply an orgId filter for a superuser', async () => {
      await service.getRecentActivities(superUser);

      expect(
        mockPrismaService.inspectionPlan.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('orgId');
      expect(
        mockPrismaService.contact.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('orgId');
    });
  });
});
