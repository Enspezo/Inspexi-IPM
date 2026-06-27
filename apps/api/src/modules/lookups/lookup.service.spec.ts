import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { LookupService } from './lookup.service';
import { PrismaService } from '@/prisma';

/** Alle 11 lookup-delegates + de norm-type-definitie die listAllGrouped raakt. */
const LOOKUP_MODELS = [
  'inspectionTypeOption',
  'planStatusType',
  'assetStatusType',
  'findingStatusType',
  'reportStatusType',
  'signatoryTypeOption',
  'signerRoleOption',
  'passFailStatusType',
  'resolutionStatusType',
  'clientRequestTypeOption',
  'clientRequestStatusType',
] as const;

describe('LookupService', () => {
  let service: LookupService;
  let mockPrismaService: any;

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

    mockPrismaService = {
      normTypeDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    };
    for (const model of LOOKUP_MODELS) {
      mockPrismaService[model] = { findMany: jest.fn().mockResolvedValue([]) };
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookupService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LookupService>(LookupService);
  });

  describe('listAllGrouped', () => {
    it('should return all 13 PWA keys', async () => {
      const result = await service.listAllGrouped(mockUser);

      expect(Object.keys(result).sort()).toEqual(
        [
          'assetStatuses',
          'clientRequestStatuses',
          'clientRequestTypes',
          'findingStatuses',
          'inspectionTypes',
          'normTypes',
          'passFailStatuses',
          'planStatuses',
          'projectStatuses',
          'reportStatuses',
          'resolutionStatuses',
          'signatoryTypes',
          'signerRoles',
        ].sort(),
      );
    });

    it('should map lookup rows to the LookupItem subset (drops id/orgId/isSystem)', async () => {
      mockPrismaService.findingStatusType.findMany.mockResolvedValue([
        {
          id: 'fs-1',
          orgId: null,
          code: 'OPEN',
          label: 'Open',
          color: '#ff0000',
          sortOrder: 1,
          isActive: true,
          isSystem: true,
        },
      ]);

      const result = await service.listAllGrouped(mockUser);

      expect(result.findingStatuses).toEqual([
        { code: 'OPEN', label: 'Open', color: '#ff0000', sortOrder: 1, isActive: true },
      ]);
    });

    it('should let an org-row override the system default with the same code', async () => {
      mockPrismaService.planStatusType.findMany.mockResolvedValue([
        { id: 's', orgId: null, code: 'DRAFT', label: 'Concept', color: null, sortOrder: 1, isActive: true, isSystem: true },
        { id: 'o', orgId: 'org-1', code: 'DRAFT', label: 'Mijn concept', color: '#00f', sortOrder: 1, isActive: true, isSystem: false },
      ]);

      const result = await service.listAllGrouped(mockUser);

      expect(result.planStatuses).toEqual([
        { code: 'DRAFT', label: 'Mijn concept', color: '#00f', sortOrder: 1, isActive: true },
      ]);
    });

    it('should source normTypes from NormTypeDefinition with color=null', async () => {
      mockPrismaService.normTypeDefinition.findMany.mockResolvedValue([
        { code: 'NEN3140', label: 'NEN 3140', sortOrder: 0, isActive: true },
      ]);

      const result = await service.listAllGrouped(mockUser);

      expect(mockPrismaService.normTypeDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      expect(result.normTypes).toEqual([
        { code: 'NEN3140', label: 'NEN 3140', color: null, sortOrder: 0, isActive: true },
      ]);
    });

    it('should expose projectStatuses as an empty array (enum, not a lookup table)', async () => {
      const result = await service.listAllGrouped(mockUser);
      expect(result.projectStatuses).toEqual([]);
    });

    it('should org-scope each lookup query for a non-superuser', async () => {
      await service.listAllGrouped(mockUser);

      const where = mockPrismaService.findingStatusType.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ OR: [{ orgId: null }, { orgId: 'org-1' }] });
    });

    it('should only read system defaults for a SUPERUSER (orgId null)', async () => {
      await service.listAllGrouped(mockSuperuser);

      const where = mockPrismaService.findingStatusType.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ OR: [{ orgId: null }] });
    });
  });
});
