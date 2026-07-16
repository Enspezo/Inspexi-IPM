import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientInspectionsService } from './client-inspections.service';
import { PrismaService } from '@/prisma';
import { STATUS_OPEN, STATUS_RESOLVED } from '@/common';

describe('ClientInspectionsService (tenant + ClientAccess scoping)', () => {
  let service: ClientInspectionsService;

  const mockPrisma = {
    clientAccess: { findMany: jest.fn() },
    inspectionClientAccess: { findMany: jest.fn(), findFirst: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), findMany: jest.fn() },
    finding: { findMany: jest.fn(), count: jest.fn() },
    assetNode: { findMany: jest.fn() },
    generatedDocument: { findMany: jest.fn() },
    documentSignature: { findMany: jest.fn() },
  };

  const user = {
    id: 'cu-1',
    email: 'k@klant.nl',
    firstName: 'K',
    lastName: 'Lant',
    status: 'ACTIVE',
    function: null,
    phone: null,
  } as const;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ClientInspectionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(ClientInspectionsService);
  });

  describe('requireOrg', () => {
    it('gooit BadRequest zonder org-subdomein (orgId null)', () => {
      expect(() => service.requireOrg(null)).toThrow(BadRequestException);
    });
    it('geeft de orgId terug wanneer aanwezig', () => {
      expect(service.requireOrg('org-A')).toBe('org-A');
    });
  });

  describe('assertSignAccess (SEC-11)', () => {
    it('staat ondertekenen toe met een canSign-grant', async () => {
      mockPrisma.inspectionClientAccess.findFirst.mockResolvedValue({ inspectionPlanId: 'plan-1' });
      await expect(service.assertSignAccess('cu-1', 'org-A', 'plan-1')).resolves.toBeUndefined();
      expect(mockPrisma.inspectionClientAccess.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientUserId: 'cu-1', inspectionPlanId: 'plan-1', canSign: true }),
        }),
      );
    });

    it('weigert ondertekenen zonder canSign-grant (view-only)', async () => {
      mockPrisma.inspectionClientAccess.findFirst.mockResolvedValue(null);
      await expect(service.assertSignAccess('cu-1', 'org-A', 'plan-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('hasAccessToInspection (happy / forbidden)', () => {
    it('true wanneer een contact-gescopet plan in deze org bestaat', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({ id: 'plan-1' });

      await expect(service.hasAccessToInspection('cu-1', 'org-A', 'plan-1')).resolves.toBe(true);
      // Query scopet ALTIJD op orgId + deletedAt + de toegangs-OR.
      expect(mockPrisma.inspectionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'plan-1', orgId: 'org-A', deletedAt: null }),
        }),
      );
    });

    it('false (cross-tenant) wanneer de klant geen toegang heeft in deze org', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);

      await expect(service.hasAccessToInspection('cu-1', 'org-B', 'plan-1')).resolves.toBe(false);
      // Zonder toegang wordt de plan-query niet eens uitgevoerd.
      expect(mockPrisma.inspectionPlan.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('list (cross-tenant → leeg)', () => {
    it('geeft [] voor een klant zonder toegang op dit org-subdomein', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);

      await expect(service.list(user, 'org-B')).resolves.toEqual([]);
      expect(mockPrisma.inspectionPlan.findMany).not.toHaveBeenCalled();
    });

    it('scopet de query op org + toegankelijke contacten', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findMany.mockResolvedValue([{ id: 'plan-1' }]);

      await expect(service.list(user, 'org-A')).resolves.toEqual([{ id: 'plan-1' }]);
      expect(mockPrisma.inspectionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-A',
            deletedAt: null,
            OR: [{ contactId: { in: ['contact-A'] } }],
          }),
        }),
      );
    });
  });

  describe('detail (forbidden / happy)', () => {
    it('gooit Forbidden wanneer de klant geen toegang heeft (cross-tenant)', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);

      await expect(service.detail(user, 'org-B', 'plan-1')).rejects.toThrow(ForbiddenException);
    });

    it('geeft het plan met finding-counts bij toegang', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' }) // access-check
        .mockResolvedValueOnce({ id: 'plan-1' }); // detail
      // Findings dragen sinds de unified-tree zelf assetNodeId + inspectionPlanId.
      mockPrisma.finding.findMany.mockResolvedValue([
        { id: 'f1', assetNodeId: 'an-1', statusCode: STATUS_OPEN, shortDescription: 'a', classificationValues: {} },
        { id: 'f2', assetNodeId: 'an-1', statusCode: STATUS_RESOLVED, shortDescription: 'b', classificationValues: {} },
      ]);
      mockPrisma.assetNode.findMany.mockResolvedValue([
        { id: 'an-1', name: 'Asset 1', typeCode: 'switchboard', statusCode: 'ok' },
      ]);

      const res = await service.detail(user, 'org-A', 'plan-1');
      expect(res.findingCounts).toEqual({ total: 2, open: 1, resolved: 1 });
    });

    it('resolvet inspecteur-contact server-side en stript rauwe velden + org-modus', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' }) // access-check
        .mockResolvedValueOnce({
          id: 'plan-1',
          // org-modus: telefoon mét consent → inspecteur; e-mail zónder consent → statische terugval
          organization: {
            inspectorPhoneDisplay: 'INSPECTOR',
            inspectorEmailDisplay: 'INSPECTOR',
            inspectorStaticPhone: '+31 20 000 0000',
            inspectorStaticEmail: 'static@org.nl',
          },
          assignedUser: {
            id: 'insp-1',
            firstName: 'In',
            lastName: 'Spector',
            contactPhone: '+31 6 11111111',
            contactEmail: 'prive@insp.nl',
            sharePhoneWithClients: true,
            shareEmailWithClients: false,
          },
          reviewer: { id: 'insp-1', firstName: 'In', lastName: 'Spector' },
        });
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const res = await service.detail(user, 'org-A', 'plan-1');

      // Telefoon = inspecteur (consent), e-mail = statische terugval (geen consent).
      expect(res.assignedUser).toEqual({
        id: 'insp-1',
        firstName: 'In',
        lastName: 'Spector',
        phone: '+31 6 11111111',
        email: 'static@org.nl',
      });
      // Org-modus en rauwe velden zijn uit de response gestript.
      expect((res as { organization?: unknown }).organization).toBeUndefined();
      const raw = JSON.stringify(res);
      expect(raw).not.toContain('sharePhoneWithClients');
      expect(raw).not.toContain('prive@insp.nl');
      // Reviewer blijft naam-only, ook al is het dezelfde gebruiker.
      expect(res.reviewer).toEqual({ id: 'insp-1', firstName: 'In', lastName: 'Spector' });
    });
  });

  describe('accessibleContactIds', () => {
    it('scopet ClientAccess op de org via het contact', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'c1' }, { contactId: 'c2' }]);
      await expect(service.accessibleContactIds('cu-1', 'org-A')).resolves.toEqual(['c1', 'c2']);
      expect(mockPrisma.clientAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientUserId: 'cu-1', contact: { orgId: 'org-A', isDeleted: false } },
        }),
      );
    });
  });
});
