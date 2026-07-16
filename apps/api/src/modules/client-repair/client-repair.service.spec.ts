// Online herstel (PRD-14 fase 2): unit tests voor ClientRepairService.
// Dekt de anonieme lookup (besluit 11: één generieke foutmelding), de sessiestart
// voor ingelogde klanten, de atomaire first-wins-claim (besluit 2/3), de eenmalige
// kritiek-trigger (besluit 9), de sessie-weergave zonder herstellergegevens
// (besluit 4) en de sessie-gescopede foto-flow.
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RepairAccessType, RepairSessionStatus } from '@prisma/client';
import { ClientRepairService } from './client-repair.service';
import { RepairEventsService } from './repair-events.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import {
  ONLINE_HERSTEL_FEATURE,
  REPAIR_LOOKUP_GENERIC_ERROR,
  REPAIR_CONFLICT_ERROR,
  RESOLUTION_REPORTED,
  RESOLUTION_CONFLICT,
  STATUS_OPEN,
  STATUS_RESOLVED,
} from '@/common';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';

/** Wacht tot fire-and-forget promises (kritiek-check, conflictdispatch) zijn afgelopen. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ClientRepairService', () => {
  let service: ClientRepairService;

  const mockPrisma = {
    repairSession: { create: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), updateMany: jest.fn() },
    finding: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    findingResolution: { findFirst: jest.fn(), create: jest.fn() },
    findingResolutionPhoto: { findFirst: jest.fn(), create: jest.fn() },
    photo: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
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
  };

  const mockEntitlements = {
    getEnabledFeatures: jest.fn(),
  };

  const mockEvents = {
    onRepairConflict: jest.fn(),
    onAllCriticalRepaired: jest.fn(),
  };

  /** Actieve ANONYMOUS-sessie zoals de guard die op de request hangt. */
  const buildSession = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'sess-1',
      orgId: 'org-1',
      inspectionPlanId: 'plan-1',
      accessType: RepairAccessType.ANONYMOUS,
      status: RepairSessionStatus.ACTIVE,
      token: 'tok',
      clientUserId: null,
      contactName: null,
      companyName: null,
      email: null,
      generatedDocumentId: null,
      expiresAt: new Date(Date.now() + 60_000),
      completedAt: null,
      ...overrides,
    }) as any;

  /** Volledig plan zoals getSessionView het (met includes) opvraagt. */
  const buildViewPlan = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    orgId: 'org-1',
    projectName: 'Demo-inspectie',
    referenceNumber: 'RAP-1',
    addressStreet: 'Zuidas',
    addressHouseNumber: '1',
    addressPostalCode: '1234 AB',
    addressCity: 'Amsterdam',
    plannedDate: null,
    location: null,
    assignedUser: null,
    organization: {
      inspectorPhoneDisplay: 'HIDDEN',
      inspectorEmailDisplay: 'HIDDEN',
      inspectorStaticPhone: null,
      inspectorStaticEmail: null,
    },
    inspectionTemplate: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientRepairService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: ClientInspectionsService, useValue: mockInspections },
        { provide: EntitlementsService, useValue: mockEntitlements },
        { provide: RepairEventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ClientRepairService>(ClientRepairService);

    // Defaults: entitlement aan, transactie voert de callback direct uit op mockPrisma,
    // sessie-create echoot z'n data terug, events resolven, geen findings/foto's.
    mockEntitlements.getEnabledFeatures.mockResolvedValue([ONLINE_HERSTEL_FEATURE]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.repairSession.create.mockImplementation(async ({ data }: any) => ({
      id: 'sess-new',
      status: RepairSessionStatus.ACTIVE,
      clientUserId: null,
      contactName: null,
      companyName: null,
      email: null,
      generatedDocumentId: null,
      completedAt: null,
      ...data,
    }));
    mockPrisma.finding.findMany.mockResolvedValue([]);
    mockPrisma.finding.count.mockResolvedValue(0);
    mockPrisma.photo.findMany.mockResolvedValue([]);
    mockEvents.onRepairConflict.mockResolvedValue(undefined);
    mockEvents.onAllCriticalRepaired.mockResolvedValue(undefined);
    mockInspections.requireOrg.mockReturnValue('org-1');
    mockInspections.assertInspectionAccess.mockResolvedValue(undefined);
  });

  // ── lookup (anonieme toegang) ───────────────────────────

  describe('lookup', () => {
    const lookupPlan = (overrides: Record<string, unknown> = {}) => ({
      id: 'plan-1',
      addressPostalCode: '1234 AB',
      location: null,
      ...overrides,
    });

    it('maakt een ANONYMOUS-sessie met 96-tekens hex-token en ~72u expiry; normaliseert de invoer', async () => {
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce(lookupPlan()) // lookup-query
        .mockResolvedValueOnce(buildViewPlan()); // getSessionView

      const before = Date.now();
      const result = await service.lookup(
        'org-1',
        { referenceNumber: '  rap-1  ', postalCode: '1234 ab' } as any,
        '1.2.3.4',
      );

      // Where-clause: getrimd rapportnummer, case-insensitief, vlag + org + soft-delete.
      expect(mockPrisma.inspectionPlan.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            deletedAt: null,
            onlineRepairEnabled: true,
            referenceNumber: { equals: 'rap-1', mode: 'insensitive' },
          },
          select: expect.any(Object),
        }),
      );

      const created = mockPrisma.repairSession.create.mock.calls[0][0].data;
      expect(created).toEqual(
        expect.objectContaining({
          orgId: 'org-1',
          inspectionPlanId: 'plan-1',
          accessType: RepairAccessType.ANONYMOUS,
          createdIpAddress: '1.2.3.4',
        }),
      );
      // Token: 48 random bytes → 96 hex-tekens.
      expect(created.token).toMatch(/^[0-9a-f]{96}$/);
      expect(result.token).toBe(created.token);

      // Expiry ~72 uur vooruit (REPAIR_SESSION_TTL_MS).
      const ttl = (result.expiresAt as Date).getTime() - before;
      expect(ttl).toBeGreaterThan(71.9 * 60 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(72.1 * 60 * 60 * 1000);

      // De sessie-view reist mee in het lookup-antwoord.
      expect(result.plan).toEqual(expect.objectContaining({ id: 'plan-1' }));
      expect(result.session).toEqual(
        expect.objectContaining({ accessType: RepairAccessType.ANONYMOUS }),
      );
    });

    it('matcht via de locatie-postcode wanneer het plan-adres geen postcode heeft', async () => {
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce(
          lookupPlan({ addressPostalCode: null, location: { postalCode: '1234AB' } }),
        )
        .mockResolvedValueOnce(buildViewPlan());

      const result = await service.lookup(
        'org-1',
        { referenceNumber: 'RAP-1', postalCode: '1234 ab' } as any,
      );

      expect(result.token).toBeDefined();
      expect(mockPrisma.repairSession.create).toHaveBeenCalledTimes(1);
    });

    // Besluit 11: ELKE mislukking geeft exact dezelfde generieke melding en
    // laat geen sessie achter.
    const expectGenericFailure = async (promise: Promise<unknown>) => {
      await expect(promise).rejects.toThrow(NotFoundException);
      expect(mockPrisma.repairSession.create).not.toHaveBeenCalled();
    };

    it('faalt generiek zonder org-subdomein (orgId null)', async () => {
      await expectGenericFailure(
        service.lookup(null, { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      );
      await expect(
        service.lookup(null, { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      ).rejects.toMatchObject({ message: REPAIR_LOOKUP_GENERIC_ERROR });
      expect(mockEntitlements.getEnabledFeatures).not.toHaveBeenCalled();
    });

    it('faalt generiek zonder ONLINE_HERSTEL-entitlement', async () => {
      mockEntitlements.getEnabledFeatures.mockResolvedValue([]);

      await expectGenericFailure(
        service.lookup('org-1', { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      );
      await expect(
        service.lookup('org-1', { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      ).rejects.toMatchObject({ message: REPAIR_LOOKUP_GENERIC_ERROR });
      expect(mockPrisma.inspectionPlan.findFirst).not.toHaveBeenCalled();
    });

    it('faalt generiek wanneer het plan niet gevonden wordt (of de vlag uit staat)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);

      await expectGenericFailure(
        service.lookup('org-1', { referenceNumber: 'RAP-X', postalCode: '1234 AB' } as any),
      );
      await expect(
        service.lookup('org-1', { referenceNumber: 'RAP-X', postalCode: '1234 AB' } as any),
      ).rejects.toMatchObject({ message: REPAIR_LOOKUP_GENERIC_ERROR });
    });

    it('faalt generiek bij een postcode-mismatch', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(
        lookupPlan({ addressPostalCode: '9999 ZZ' }),
      );

      await expectGenericFailure(
        service.lookup('org-1', { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      );
      await expect(
        service.lookup('org-1', { referenceNumber: 'RAP-1', postalCode: '1234 AB' } as any),
      ).rejects.toMatchObject({ message: REPAIR_LOOKUP_GENERIC_ERROR });
    });
  });

  // ── startClientSession (ingelogde klant) ────────────────

  describe('startClientSession', () => {
    const clientUser = {
      id: 'cu-1',
      email: 'k@klant.nl',
      firstName: 'Kees',
      lastName: 'Klant',
    } as any;

    it('weigert een plan zonder onlineRepairEnabled', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        onlineRepairEnabled: false,
      });

      await expect(
        service.startClientSession(clientUser, 'org-1', { inspectionPlanId: 'plan-1' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.repairSession.create).not.toHaveBeenCalled();
    });

    it('maakt een CLIENT_USER-sessie met vooringevulde naam/e-mail na de toegangscheck', async () => {
      mockPrisma.inspectionPlan.findFirst
        .mockResolvedValueOnce({ id: 'plan-1', onlineRepairEnabled: true })
        .mockResolvedValueOnce(buildViewPlan());

      const result = await service.startClientSession(clientUser, 'org-1', {
        inspectionPlanId: 'plan-1',
      } as any);

      expect(mockInspections.assertInspectionAccess).toHaveBeenCalledWith(
        'cu-1',
        'org-1',
        'plan-1',
      );
      expect(mockPrisma.repairSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            inspectionPlanId: 'plan-1',
            accessType: RepairAccessType.CLIENT_USER,
            clientUserId: 'cu-1',
            contactName: 'Kees Klant',
            email: 'k@klant.nl',
          }),
        }),
      );
      expect(result.session.accessType).toBe(RepairAccessType.CLIENT_USER);
      expect(result.session.contactName).toBe('Kees Klant');
    });
  });

  // ── claimFinding (first-wins) ───────────────────────────

  describe('claimFinding', () => {
    const setupClaim = () => {
      mockPrisma.finding.findFirst.mockResolvedValue({ id: 'f-1' });
      mockPrisma.findingResolution.findFirst.mockResolvedValue(null);
    };

    it('WIN: flipt de finding atomisch en registreert een REPORTED-resolutie', async () => {
      setupClaim();
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 1 });
      const created = {
        id: 'res-1',
        statusCode: RESOLUTION_REPORTED,
        description: 'Kabel vervangen',
        resolvedAt: new Date(),
      };
      mockPrisma.findingResolution.create.mockResolvedValue(created);

      const result = await service.claimFinding(buildSession(), 'f-1', {
        description: 'Kabel vervangen',
      } as any);
      await flush();

      // First-wins: alleen een rij die nog 'open' is wordt geraakt.
      expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'f-1', statusCode: STATUS_OPEN }),
          data: expect.objectContaining({
            statusCode: STATUS_RESOLVED,
            resolvedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockPrisma.findingResolution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            findingId: 'f-1',
            repairSessionId: 'sess-1',
            statusCode: RESOLUTION_REPORTED,
          }),
        }),
      );
      expect(result.resolution).toEqual(
        expect.objectContaining({ id: 'res-1', statusCode: RESOLUTION_REPORTED }),
      );

      // Kritiek-check is (fire-and-forget) gestart: beide counts zijn opgevraagd.
      expect(mockPrisma.finding.count).toHaveBeenCalledTimes(2);
      expect(mockEvents.onRepairConflict).not.toHaveBeenCalled();
    });

    it('LOSS: bewaart de invoer als CONFLICT, dispatcht het conflict-event en gooit 409', async () => {
      setupClaim();
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 0 });
      const conflictResolution = {
        id: 'res-2',
        statusCode: RESOLUTION_CONFLICT,
        description: 'Te laat',
        resolvedAt: new Date(),
      };
      mockPrisma.findingResolution.create.mockResolvedValue(conflictResolution);
      const session = buildSession();

      await expect(
        service.claimFinding(session, 'f-1', { description: 'Te laat' } as any),
      ).rejects.toMatchObject({ message: REPAIR_CONFLICT_ERROR });
      await expect(
        service.claimFinding(session, 'f-1', { description: 'Te laat' } as any),
      ).rejects.toThrow(ConflictException);
      await flush();

      expect(mockPrisma.findingResolution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusCode: RESOLUTION_CONFLICT }),
        }),
      );
      expect(mockEvents.onRepairConflict).toHaveBeenCalledWith(
        session,
        'f-1',
        conflictResolution,
      );
      // De kritiek-check draait alleen op een gewonnen claim.
      expect(mockPrisma.finding.count).not.toHaveBeenCalled();
    });

    it('weigert een dubbelclaim binnen dezelfde sessie zonder transactie', async () => {
      mockPrisma.finding.findFirst.mockResolvedValue({ id: 'f-1' });
      mockPrisma.findingResolution.findFirst.mockResolvedValue({ id: 'res-mine' });

      await expect(
        service.claimFinding(buildSession(), 'f-1', { description: 'x' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('weigert een claim op een niet-ACTIVE sessie', async () => {
      await expect(
        service.claimFinding(
          buildSession({ status: RepairSessionStatus.COMPLETED }),
          'f-1',
          { description: 'x' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.finding.findFirst).not.toHaveBeenCalled();
    });

    it('gooit NotFound voor een constatering buiten plan/org', async () => {
      mockPrisma.finding.findFirst.mockResolvedValue(null);

      await expect(
        service.claimFinding(buildSession(), 'f-x', { description: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── checkCriticalRepaired (via claim WIN, besluit 9) ────

  describe('checkCriticalRepaired (fire-and-forget na een gewonnen claim)', () => {
    const winClaim = async () => {
      mockPrisma.finding.findFirst.mockResolvedValue({ id: 'f-1' });
      mockPrisma.findingResolution.findFirst.mockResolvedValue(null);
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.findingResolution.create.mockResolvedValue({
        id: 'res-1',
        statusCode: RESOLUTION_REPORTED,
        description: 'x',
        resolvedAt: new Date(),
      });
      await service.claimFinding(buildSession(), 'f-1', { description: 'x' } as any);
      await flush();
    };

    it('doet niets zolang er nog open kritieke constateringen zijn', async () => {
      mockPrisma.finding.count
        .mockResolvedValueOnce(1) // open kritiek
        .mockResolvedValueOnce(2); // totaal kritiek

      await winClaim();

      expect(mockPrisma.inspectionPlan.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.onAllCriticalRepaired).not.toHaveBeenCalled();
    });

    it('zet de timestamp en vuurt de hook exact één keer bij nul open + >0 totaal', async () => {
      mockPrisma.finding.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);
      mockPrisma.inspectionPlan.updateMany.mockResolvedValue({ count: 1 });

      await winClaim();

      // Atomische guard: alleen wanneer criticalRepairNotifiedAt nog null is.
      expect(mockPrisma.inspectionPlan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1', criticalRepairNotifiedAt: null },
          data: { criticalRepairNotifiedAt: expect.any(Date) },
        }),
      );
      expect(mockEvents.onAllCriticalRepaired).toHaveBeenCalledTimes(1);
      expect(mockEvents.onAllCriticalRepaired).toHaveBeenCalledWith('plan-1', 'org-1');
    });

    it('vuurt de hook NIET wanneer de timestamp al gezet was (updateMany count 0)', async () => {
      mockPrisma.finding.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);
      mockPrisma.inspectionPlan.updateMany.mockResolvedValue({ count: 0 });

      await winClaim();

      expect(mockPrisma.inspectionPlan.updateMany).toHaveBeenCalledTimes(1);
      expect(mockEvents.onAllCriticalRepaired).not.toHaveBeenCalled();
    });

    it('doet niets voor een plan zonder kritieke constateringen (totaal 0)', async () => {
      mockPrisma.finding.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await winClaim();

      expect(mockPrisma.inspectionPlan.updateMany).not.toHaveBeenCalled();
      expect(mockEvents.onAllCriticalRepaired).not.toHaveBeenCalled();
    });
  });

  // ── getSessionView (besluit 4: nooit wie herstelde) ─────

  describe('getSessionView', () => {
    const classificationModel = {
      characteristics: [
        {
          code: 'SEVERITY',
          options: [
            { code: 'C1', name: 'Kritiek', color: '#dc2626', isCritical: true },
            { code: 'C3', name: 'Gering', color: '#ca8a04', isCritical: false },
          ],
        },
      ],
    };

    const baseFinding = (overrides: Record<string, unknown>) => ({
      shortDescription: 'kort',
      longDescription: null,
      locationDescription: null,
      normReference: null,
      recommendation: null,
      isCritical: false,
      resolvedAt: null,
      resolutions: [],
      ...overrides,
    });

    it('groepeert de samenvatting per classificatie, nummert volgordelijk en verbergt herstellergegevens', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(
        buildViewPlan({ inspectionTemplate: { classificationModel } }),
      );
      mockPrisma.finding.findMany.mockResolvedValue([
        baseFinding({
          id: 'f-1',
          statusCode: STATUS_OPEN,
          isCritical: true,
          classificationValues: { SEVERITY: 'C1' },
        }),
        baseFinding({
          id: 'f-2',
          statusCode: STATUS_RESOLVED,
          isCritical: true,
          classificationValues: { SEVERITY: 'C1' },
          resolutions: [
            {
              id: 'r-reported-other',
              statusCode: RESOLUTION_REPORTED,
              description: 'Door een ander hersteld',
              resolvedAt: new Date('2026-07-01'),
              repairSessionId: 'sess-OTHER',
              photos: [{ id: 'rp-1' }],
            },
          ],
        }),
        baseFinding({
          id: 'f-3',
          statusCode: STATUS_OPEN,
          classificationValues: { SEVERITY: 'C3' },
          resolutions: [
            {
              id: 'r-conflict-mine',
              statusCode: RESOLUTION_CONFLICT,
              description: 'Mijn conflictmelding',
              resolvedAt: new Date('2026-07-02'),
              repairSessionId: 'sess-1',
              photos: [],
            },
          ],
        }),
        baseFinding({
          id: 'f-4',
          statusCode: STATUS_OPEN,
          classificationValues: {},
          resolutions: [
            {
              id: 'r-conflict-other',
              statusCode: RESOLUTION_CONFLICT,
              description: 'Andermans conflict',
              resolvedAt: new Date('2026-07-03'),
              repairSessionId: 'sess-OTHER',
              photos: [],
            },
          ],
        }),
      ]);
      mockPrisma.photo.findMany.mockResolvedValue([{ id: 'ph-1', entityId: 'f-1' }]);

      const view = await service.getSessionView(buildSession());

      // Samenvatting: C1 (1 open + 1 hersteld, kritiek), C3 (1 open), '-' (ongeclassificeerd).
      expect(view.summary).toEqual([
        {
          code: 'C1',
          label: 'Kritiek',
          color: '#dc2626',
          isCritical: true,
          openCount: 1,
          resolvedCount: 1,
        },
        {
          code: 'C3',
          label: 'Gering',
          color: '#ca8a04',
          isCritical: false,
          openCount: 1,
          resolvedCount: 0,
        },
        {
          code: '-',
          label: 'Niet geclassificeerd',
          color: '#666666',
          isCritical: false,
          openCount: 1,
          resolvedCount: 0,
        },
      ]);

      // Volgnummers volgen de createdAt-volgorde.
      expect(view.findings.map((f: any) => [f.id, f.seq])).toEqual([
        ['f-1', 1],
        ['f-2', 2],
        ['f-3', 3],
        ['f-4', 4],
      ]);

      // Constatering-foto's via de sessie-gescopede foto-route.
      expect(view.findings[0].photos).toEqual([
        { id: 'ph-1', url: '/api/v1/client/repair/photos/ph-1' },
      ]);

      // REPORTED van een ANDERE sessie is zichtbaar, maar anoniem (isMine false,
      // geen herstellergegevens — besluit 4).
      const repaired = view.findings[1].repair;
      expect(repaired).toEqual(
        expect.objectContaining({
          resolutionId: 'r-reported-other',
          description: 'Door een ander hersteld',
          isMine: false,
          photos: [{ id: 'rp-1', url: '/api/v1/client/repair/photos/rp-1' }],
        }),
      );
      for (const finding of view.findings as any[]) {
        for (const block of [finding.repair, finding.myConflict]) {
          if (!block) continue;
          expect(block).not.toHaveProperty('contactName');
          expect(block).not.toHaveProperty('companyName');
          expect(block).not.toHaveProperty('email');
        }
      }

      // CONFLICT: alleen die van de eigen sessie is zichtbaar.
      expect(view.findings[2].myConflict).toEqual(
        expect.objectContaining({ resolutionId: 'r-conflict-mine' }),
      );
      expect(view.findings[3].myConflict).toBeNull();
      expect(view.findings[3].repair).toBeNull();
    });

    it('gooit NotFound wanneer het plan van de sessie niet (meer) bestaat', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(null);

      await expect(service.getSessionView(buildSession())).rejects.toThrow(NotFoundException);
    });
  });

  // ── uploadResolutionPhotos ──────────────────────────────

  describe('uploadResolutionPhotos', () => {
    const file = (mimetype: string) =>
      ({ mimetype, buffer: Buffer.from('img') }) as Express.Multer.File;

    it('weigert zonder eigen herstelmelding', async () => {
      mockPrisma.findingResolution.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadResolutionPhotos(buildSession(), 'f-1', [file('image/jpeg')]),
      ).rejects.toThrow(BadRequestException);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('weigert boven het maximum van 5 foto’s in totaal', async () => {
      mockPrisma.findingResolution.findFirst.mockResolvedValue({
        id: 'res-1',
        photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
      });

      await expect(
        service.uploadResolutionPhotos(buildSession(), 'f-1', [
          file('image/jpeg'),
          file('image/jpeg'),
        ]),
      ).rejects.toThrow(/Maximaal 5/);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('uploadt via de storage-provider en geeft sessie-gescopede foto-URLs terug', async () => {
      mockPrisma.findingResolution.findFirst.mockResolvedValue({ id: 'res-1', photos: [] });
      mockStorage.upload.mockResolvedValue(undefined);
      const uploadedAt = new Date();
      mockPrisma.findingResolutionPhoto.create.mockImplementation(async ({ data }: any) => ({
        id: `photo-${data.photoUrl.endsWith('.png') ? 'png' : 'jpg'}`,
        uploadedAt,
      }));

      const result = await service.uploadResolutionPhotos(buildSession(), 'f-1', [
        file('image/png'),
        file('image/jpeg'),
      ]);

      expect(mockStorage.upload).toHaveBeenCalledTimes(2);
      expect(mockStorage.upload.mock.calls[0][0]).toMatch(
        /^org-1\/finding-photos\/[0-9a-f-]+\.png$/,
      );
      expect(mockStorage.upload.mock.calls[1][0]).toMatch(
        /^org-1\/finding-photos\/[0-9a-f-]+\.jpg$/,
      );
      expect(result).toEqual([
        { id: 'photo-png', uploadedAt, url: '/api/v1/client/repair/photos/photo-png' },
        { id: 'photo-jpg', uploadedAt, url: '/api/v1/client/repair/photos/photo-jpg' },
      ]);
    });
  });

  // ── getPhoto (sessie-scope) ─────────────────────────────

  describe('getPhoto', () => {
    it('verbergt conflict-foto’s van een ANDERE sessie (PRD §14.9.2)', async () => {
      mockPrisma.findingResolutionPhoto.findFirst.mockResolvedValue({
        photoUrl: 'org-1/finding-photos/x.jpg',
        resolution: { statusCode: RESOLUTION_CONFLICT, repairSessionId: 'sess-OTHER' },
      });

      await expect(service.getPhoto(buildSession(), 'photo-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockStorage.download).not.toHaveBeenCalled();
    });

    it('geeft een eigen conflict-foto wél terug (mimeType op extensie)', async () => {
      mockPrisma.findingResolutionPhoto.findFirst.mockResolvedValue({
        photoUrl: 'org-1/finding-photos/x.png',
        resolution: { statusCode: RESOLUTION_CONFLICT, repairSessionId: 'sess-1' },
      });
      mockStorage.download.mockResolvedValue(Buffer.from('png'));

      const result = await service.getPhoto(buildSession(), 'photo-1');

      expect(mockStorage.download).toHaveBeenCalledWith('org-1/finding-photos/x.png');
      expect(result.mimeType).toBe('image/png');
    });

    it('verbergt constatering-foto’s van een ander plan', async () => {
      mockPrisma.findingResolutionPhoto.findFirst.mockResolvedValue(null);
      mockPrisma.photo.findFirst.mockResolvedValue({
        entityId: 'f-elders',
        storagePath: 'pad',
        mimeType: 'image/jpeg',
      });
      // De finding hoort niet bij het plan van de sessie → geen match.
      mockPrisma.finding.findFirst.mockResolvedValue(null);

      await expect(service.getPhoto(buildSession(), 'photo-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockStorage.download).not.toHaveBeenCalled();
    });
  });
});
