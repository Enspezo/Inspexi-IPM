import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientInspectionsService } from './client-inspections.service';
import { PrismaService } from '@/prisma';
import { STATUS_OPEN, STATUS_RESOLVED } from '@/common';

describe('ClientInspectionsService (tenant + ClientAccess scoping)', () => {
  let service: ClientInspectionsService;

  const mockPrisma = {
    clientAccess: { findMany: jest.fn() },
    inspectionClientAccess: { findMany: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), findMany: jest.fn() },
    finding: { findMany: jest.fn(), count: jest.fn() },
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
        .mockResolvedValueOnce({
          id: 'plan-1',
          assets: [{ findings: [{ statusCode: STATUS_OPEN }, { statusCode: STATUS_RESOLVED }] }],
        }); // detail

      const res = await service.detail(user, 'org-A', 'plan-1');
      expect(res.findingCounts).toEqual({ total: 2, open: 1, resolved: 1 });
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
