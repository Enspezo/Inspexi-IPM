// ClientFindingsService.getDetail (PRD-14 §14.3 besluit 4, review #2): bij
// herstel-flow-resoluties (REPORTED/CONFLICT) mag het klantportaal nooit zien
// wíe herstelde — resolvedByClientUser(-Id) worden genuld, óók wanneer een
// ingelogde klant de hersteller was. De klassieke klantportaal-resolutie
// (PENDING_VERIFICATION) houdt haar invullergegevens.
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientFindingsService } from './client-findings.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';

describe('ClientFindingsService', () => {
  let service: ClientFindingsService;

  const mockPrisma = {
    finding: { findFirst: jest.fn(), findUnique: jest.fn() },
    findingResolution: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    findingResolutionPhoto: { findFirst: jest.fn(), create: jest.fn() },
  };

  const mockStorage = {
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  const mockInspections = {
    requireOrg: jest.fn(),
    assertInspectionAccess: jest.fn(),
    isPlanContentReleased: jest.fn(),
  };

  const clientUser = {
    id: 'cu-1',
    email: 'k@klant.nl',
    firstName: 'Kees',
    lastName: 'Klant',
  } as any;

  const accessCheckFinding = {
    id: 'f-1',
    orgId: 'org-1',
    inspectionPlanId: 'plan-1',
    assetNode: { id: 'node-1', name: 'Verdeelkast', description: null },
  };

  const resolvedByBlock = {
    resolvedByClientUserId: 'cu-9',
    resolvedByClientUser: { id: 'cu-9', firstName: 'Herman', lastName: 'Hersteller' },
  };

  const buildResolution = (statusCode: string, overrides: Record<string, unknown> = {}) => ({
    id: `res-${statusCode.toLowerCase()}`,
    statusCode,
    description: `werkzaamheden ${statusCode}`,
    resolvedAt: new Date('2026-07-01'),
    photos: [],
    ...resolvedByBlock,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientFindingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: ClientInspectionsService, useValue: mockInspections },
      ],
    }).compile();

    service = module.get<ClientFindingsService>(ClientFindingsService);

    mockInspections.requireOrg.mockReturnValue('org-1');
    mockInspections.assertInspectionAccess.mockResolvedValue(undefined);
    // Default: rapport vrijgegeven — de B-412-gate heeft z'n eigen test hieronder.
    mockInspections.isPlanContentReleased.mockResolvedValue(true);
    mockPrisma.finding.findFirst.mockResolvedValue(accessCheckFinding);
  });

  describe('content-gate (B-412, WP-B9)', () => {
    it('gooit 404 wanneer het rapport nog niet is vrijgegeven (pending_review + gate aan)', async () => {
      mockInspections.isPlanContentReleased.mockResolvedValue(false);
      await expect(service.getDetail(clientUser, 'org-1', 'f-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockInspections.isPlanContentReleased).toHaveBeenCalledWith('org-1', 'plan-1');
    });
  });

  describe('getDetail — anonimiteit herstel-flow (review #2)', () => {
    it('nult resolvedByClientUser(-Id) voor REPORTED- en CONFLICT-resoluties, laat PENDING_VERIFICATION staan', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        ...accessCheckFinding,
        resolutions: [
          buildResolution('REPORTED'),
          buildResolution('CONFLICT'),
          buildResolution('PENDING_VERIFICATION'),
        ],
      });

      const result = await service.getDetail(clientUser, 'org-1', 'f-1');

      const byStatus = Object.fromEntries(
        result.resolutions.map((r: any) => [r.statusCode, r]),
      );

      // Herstel-flow-resoluties: nooit wie herstelde (ook niet het id).
      expect(byStatus.REPORTED.resolvedByClientUserId).toBeNull();
      expect(byStatus.REPORTED.resolvedByClientUser).toBeNull();
      expect(byStatus.CONFLICT.resolvedByClientUserId).toBeNull();
      expect(byStatus.CONFLICT.resolvedByClientUser).toBeNull();

      // De klassieke klantportaal-resolutie blijft herleidbaar naar de melder.
      expect(byStatus.PENDING_VERIFICATION.resolvedByClientUserId).toBe('cu-9');
      expect(byStatus.PENDING_VERIFICATION.resolvedByClientUser).toEqual({
        id: 'cu-9',
        firstName: 'Herman',
        lastName: 'Hersteller',
      });

      // De werkzaamheden zelf blijven wél zichtbaar (besluit 4: wat, nooit wie).
      expect(byStatus.REPORTED.description).toBe('werkzaamheden REPORTED');
    });

    it('verbergt storage-keys: foto’s krijgen een download-URL', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        ...accessCheckFinding,
        resolutions: [
          buildResolution('PENDING_VERIFICATION', {
            photos: [
              {
                id: 'photo-1',
                caption: 'voor',
                uploadedAt: new Date('2026-07-01'),
                photoUrl: 'org-1/finding-photos/geheim.jpg',
              },
            ],
          }),
        ],
      });

      const result = await service.getDetail(clientUser, 'org-1', 'f-1');

      expect(result.resolutions[0].photos).toEqual([
        {
          id: 'photo-1',
          caption: 'voor',
          uploadedAt: new Date('2026-07-01'),
          url: '/api/v1/client/findings/resolution-photos/photo-1',
        },
      ]);
    });

    it('gooit NotFound voor een constatering buiten de org (access-check)', async () => {
      mockPrisma.finding.findFirst.mockResolvedValue(null);

      await expect(service.getDetail(clientUser, 'org-1', 'f-x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.finding.findUnique).not.toHaveBeenCalled();
    });
  });
});
