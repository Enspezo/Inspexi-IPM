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
    organization: { findUnique: jest.fn() },
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
    // Default: vier-ogen-review AAN (org-default) — tests zetten dit zelf om.
    mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: true });
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
    it('gooit dezelfde 404 wanneer de klant geen toegang heeft (WP-C1/B-151: geen existence-oracle)', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);

      await expect(service.detail(user, 'org-B', 'plan-1')).rejects.toThrow(
        'Inspectie niet gevonden',
      );
    });

    it('geeft het plan met finding-counts bij toegang', async () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' }) // access-check
        .mockResolvedValueOnce({ id: 'plan-1', statusCode: 'completed' }); // detail
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
          statusCode: 'completed',
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

  // ── B-412 (WP-B9): content-gate — constateringen/documenten pas vanaf review ──
  describe('isContentReleased (B-412 review-gate)', () => {
    it.each(['reviewed', 'approved', 'completed'])(
      'released status %s → true zonder org-query',
      async (status) => {
        await expect(service.isContentReleased('org-A', status)).resolves.toBe(true);
        expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
      },
    );

    it.each(['draft', 'planned', 'in_progress', 'pending_review', 'cancelled'])(
      'niet-vrijgegeven status %s → false met de review-gate AAN',
      async (status) => {
        await expect(service.isContentReleased('org-A', status)).resolves.toBe(false);
      },
    );

    it('gate UIT (inspectionReviewEnabled=false) → alles vrijgegeven, ook pending_review', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: false });
      await expect(service.isContentReleased('org-A', 'pending_review')).resolves.toBe(true);
    });

    it('onbekende org → fail-closed (gate aan)', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.isContentReleased('org-A', 'pending_review')).resolves.toBe(false);
    });
  });

  describe('detail — content-gate (B-412)', () => {
    const accessMocks = () => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
    };

    it('pending_review + gate AAN → metadata wél, maar assets/documenten leeg en counts 0', async () => {
      accessMocks();
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' }) // access-check
        .mockResolvedValueOnce({
          id: 'plan-1',
          statusCode: 'pending_review',
          projectName: 'Nog niet gereviewd',
          generatedDocuments: [{ id: 'doc-1' }],
        });

      const res = await service.detail(user, 'org-A', 'plan-1');
      expect(res.contentReleased).toBe(false);
      expect(res.projectName).toBe('Nog niet gereviewd'); // metadata blijft
      expect(res.statusCode).toBe('pending_review'); // status blijft
      expect(res.assets).toEqual([]);
      expect(res.generatedDocuments).toEqual([]);
      expect(res.findingCounts).toEqual({ total: 0, open: 0, resolved: 0 });
      // De findings worden niet eens opgehaald.
      expect(mockPrisma.finding.findMany).not.toHaveBeenCalled();
    });

    it('pending_review + gate UIT → niets verdwijnt (contentReleased=true)', async () => {
      accessMocks();
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: false });
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' })
        .mockResolvedValueOnce({
          id: 'plan-1',
          statusCode: 'pending_review',
          generatedDocuments: [{ id: 'doc-1' }],
        });
      mockPrisma.finding.findMany.mockResolvedValue([
        { id: 'f1', assetNodeId: 'an-1', statusCode: STATUS_OPEN, shortDescription: 'a', classificationValues: {} },
      ]);
      mockPrisma.assetNode.findMany.mockResolvedValue([
        { id: 'an-1', name: 'Asset 1', typeCode: 'switchboard', statusCode: 'ok' },
      ]);

      const res = await service.detail(user, 'org-A', 'plan-1');
      expect(res.contentReleased).toBe(true);
      expect(res.generatedDocuments).toEqual([{ id: 'doc-1' }]);
      expect(res.findingCounts).toEqual({ total: 1, open: 1, resolved: 0 });
    });
  });

  describe('getFindings/getDocuments — content-gate (B-412) + canSign (B-406a)', () => {
    const accessAndPlan = (statusCode: string) => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1' }) // access-check
        .mockResolvedValueOnce({ statusCode }); // release-check (isPlanContentReleased)
    };

    it('getFindings geeft [] voor een pending_review-plan (gate AAN)', async () => {
      accessAndPlan('pending_review');
      await expect(service.getFindings(user, 'org-A', 'plan-1')).resolves.toEqual([]);
      expect(mockPrisma.finding.findMany).not.toHaveBeenCalled();
    });

    it('getDocuments geeft [] voor een pending_review-plan (gate AAN)', async () => {
      accessAndPlan('pending_review');
      await expect(service.getDocuments(user, 'org-A', 'plan-1')).resolves.toEqual([]);
      expect(mockPrisma.generatedDocument.findMany).not.toHaveBeenCalled();
    });

    it('getDocuments plakt canSign op elk document (B-406a)', async () => {
      accessAndPlan('completed');
      mockPrisma.generatedDocument.findMany.mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]);
      mockPrisma.inspectionClientAccess.findFirst.mockResolvedValue(null); // geen canSign-grant

      const res = await service.getDocuments(user, 'org-A', 'plan-1');
      expect(res).toEqual([
        { id: 'doc-1', canSign: false },
        { id: 'doc-2', canSign: false },
      ]);
    });

    it('getDocuments → canSign=true mét per-plan grant', async () => {
      accessAndPlan('completed');
      mockPrisma.generatedDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
      mockPrisma.inspectionClientAccess.findFirst.mockResolvedValue({ inspectionPlanId: 'plan-1' });

      const res = await service.getDocuments(user, 'org-A', 'plan-1');
      expect(res).toEqual([{ id: 'doc-1', canSign: true }]);
    });
  });

  describe('dashboard — gate op tellers en actie-items (B-412/B-406a)', () => {
    beforeEach(() => {
      mockPrisma.clientAccess.findMany.mockResolvedValue([{ contactId: 'contact-A' }]);
      mockPrisma.inspectionClientAccess.findMany.mockResolvedValue([]);
      mockPrisma.inspectionPlan.findMany
        .mockResolvedValueOnce([{ id: 'plan-rel' }]) // recentInspections (metadata)
        .mockResolvedValueOnce([
          { id: 'plan-rel', statusCode: 'completed' },
          { id: 'plan-gated', statusCode: 'pending_review' },
        ]); // allPlans
      mockPrisma.documentSignature.findMany.mockResolvedValue([]);
      mockPrisma.finding.count.mockResolvedValue(1);
    });

    it('telt open findings alleen over vrijgegeven plannen (gate AAN)', async () => {
      // Alleen plan-rel heeft canSign niet nodig voor de findings-teller.
      const res = await service.dashboard(user, 'org-A');
      expect(res.openFindingsCount).toBe(1);
      expect(mockPrisma.finding.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ inspectionPlanId: { in: ['plan-rel'] } }),
        }),
      );
    });

    it('pendingSignatures alleen voor plannen mét canSign-grant (B-406a)', async () => {
      // Grant alleen op plan-gated (dat bovendien niet vrijgegeven is) → geen actie-items.
      mockPrisma.inspectionClientAccess.findMany
        .mockReset()
        // accessScope → explicitPlanIds
        .mockResolvedValueOnce([])
        // signablePlanIds
        .mockResolvedValueOnce([{ inspectionPlanId: 'plan-gated' }]);

      const res = await service.dashboard(user, 'org-A');
      expect(res.pendingSignatures).toEqual([]);
      // Geen enkel releasable+signable plan → de signature-query wordt overgeslagen.
      expect(mockPrisma.documentSignature.findMany).not.toHaveBeenCalled();
    });

    it('gate UIT → ook niet-gereviewde plannen tellen mee', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ inspectionReviewEnabled: false });
      await service.dashboard(user, 'org-A');
      expect(mockPrisma.finding.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inspectionPlanId: { in: ['plan-rel', 'plan-gated'] },
          }),
        }),
      );
    });
  });
});
