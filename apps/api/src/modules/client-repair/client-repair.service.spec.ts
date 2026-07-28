// Online herstel (PRD-14 fase 2): unit tests voor ClientRepairService.
// Dekt de anonieme lookup (besluit 11: één generieke foutmelding), de sessiestart
// voor ingelogde klanten, de atomaire first-wins-claim (besluit 2/3), de eenmalige
// kritiek-trigger (besluit 9), de sessie-weergave zonder herstellergegevens
// (besluit 4) en de sessie-gescopede foto-flow.
// Fase 3: afronden (complete → concept-herstelverklaring), ondertekenen (sign →
// PDF + COMPLETED + dispatch) en de PDF-stream (getDeclarationPdf).
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  GeneratedDocumentStatus,
  Prisma,
  RepairAccessType,
  RepairSessionStatus,
  SignatureStatus,
} from '@prisma/client';
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
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { makeThumbnail } from '../photos/thumbnail.util';

// Sharp nooit laden in unit tests: de thumbnail-stap (photoDataUri) wordt gemockt.
jest.mock('../photos/thumbnail.util');

/** Wacht tot fire-and-forget promises (kritiek-check, conflictdispatch) zijn afgelopen. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ClientRepairService', () => {
  let service: ClientRepairService;

  const mockPrisma = {
    repairSession: { create: jest.fn(), update: jest.fn() },
    inspectionPlan: { findFirst: jest.fn(), updateMany: jest.fn() },
    finding: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    findingResolution: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    findingResolutionPhoto: { findFirst: jest.fn(), create: jest.fn() },
    photo: { findMany: jest.fn(), findFirst: jest.fn() },
    generatedDocument: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    documentSignature: { update: jest.fn() },
    user: { findUnique: jest.fn() },
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
    onDeclarationSigned: jest.fn(),
  };

  const mockPdf = {
    renderPdf: jest.fn(),
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
        { provide: PdfGenerationService, useValue: mockPdf },
      ],
    }).compile();

    service = module.get<ClientRepairService>(ClientRepairService);

    // Defaults: entitlement aan, transactie is polymorf (callback-vorm voert de
    // callback direct uit op mockPrisma; array-vorm — sign(), review #6 — gedraagt
    // zich als Promise.all), sessie-create echoot z'n data terug, events resolven,
    // geen findings/foto's.
    mockEntitlements.getEnabledFeatures.mockResolvedValue([ONLINE_HERSTEL_FEATURE]);
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );
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
    mockEvents.onDeclarationSigned.mockResolvedValue(undefined);
    mockInspections.requireOrg.mockReturnValue('org-1');
    mockInspections.assertInspectionAccess.mockResolvedValue(undefined);
    mockPdf.renderPdf.mockResolvedValue(Buffer.from('pdf'));
    (makeThumbnail as jest.Mock).mockResolvedValue(Buffer.from('thumb'));
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

    it('parallelle dubbelclaim: P2002 uit @@unique([findingId, repairSessionId]) → nette 400, géén 409 (review #9)', async () => {
      // De `mine`-precheck is niet atomisch: bij een dubbelklik-race binnen
      // dezelfde sessie vangt de unique-constraint de tweede claim in de
      // transactie. Die hoort als invoerfout (400) terug, niet als conflict.
      setupClaim();
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.findingResolution.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'x',
        } as any),
      );

      const error = await service
        .claimFinding(buildSession(), 'f-1', { description: 'x' } as any)
        .catch((e) => e);
      await flush();

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).not.toBeInstanceOf(ConflictException);
      expect(error.message).toBe('U heeft deze constatering al hersteld gemeld');
      // Geen conflict-dispatch en geen kritiek-check: de claim is niet doorgegaan.
      expect(mockEvents.onRepairConflict).not.toHaveBeenCalled();
      expect(mockPrisma.finding.count).not.toHaveBeenCalled();
    });

    it('een andere transactiefout dan P2002 wordt onveranderd doorgegooid', async () => {
      setupClaim();
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.findingResolution.create.mockRejectedValue(new Error('db weg'));

      await expect(
        service.claimFinding(buildSession(), 'f-1', { description: 'x' } as any),
      ).rejects.toThrow('db weg');
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

    // B-410 (WP-C2): plan ZONDER inspectietemplate (zoals RAP-TEST-100) →
    // getMainClassification kan niets resolven en doet geen uitspraak (null);
    // de view valt dan terug op het gedenormaliseerde Finding.isCritical i.p.v.
    // hardgecodeerd false te beweren.
    it('valt zonder classificatiemodel terug op Finding.isCritical (B-410)', async () => {
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(buildViewPlan()); // inspectionTemplate: null
      mockPrisma.finding.findMany.mockResolvedValue([
        baseFinding({
          id: 'f-krit',
          statusCode: STATUS_OPEN,
          isCritical: true,
          classificationValues: { SEVERITY: 'C1' },
        }),
        baseFinding({
          id: 'f-niet-krit',
          statusCode: STATUS_OPEN,
          isCritical: false,
          classificationValues: { SEVERITY: 'C3' },
        }),
      ]);

      const view = await service.getSessionView(buildSession());

      // Per constatering: classification.isCritical volgt Finding.isCritical.
      expect(view.findings[0].classification).toMatchObject({ code: 'C1', isCritical: true });
      expect(view.findings[1].classification).toMatchObject({ code: 'C3', isCritical: false });

      // En de groepssamenvatting markeert C1 als kritiek (voorheen: false + grijs).
      const c1 = view.summary.find((g: { code: string }) => g.code === 'C1');
      const c3 = view.summary.find((g: { code: string }) => g.code === 'C3');
      expect(c1).toMatchObject({ isCritical: true, openCount: 1 });
      expect(c3).toMatchObject({ isCritical: false, openCount: 1 });
    });
  });

  // ── uploadResolutionPhotos ──────────────────────────────

  describe('uploadResolutionPhotos', () => {
    // Echte magic bytes per claim — de upload valideert sinds WP-B4 op inhoud
    // en bepaalt daaruit de opslagextensie.
    const MAGIC: Record<string, Buffer> = {
      'image/png': Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]),
      ]),
      'image/jpeg': Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('jpeg-body')]),
    };
    const file = (mimetype: string) =>
      ({ mimetype, buffer: MAGIC[mimetype] ?? Buffer.from('img') }) as Express.Multer.File;

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

  // ── Fase 3: herstelverklaring (complete / sign / pdf) ───

  describe('fase 3 — herstelverklaring', () => {
    /** Eigen REPORTED-resolutie mét bewijsfoto, incl. finding-gegevens voor de verklaring. */
    const buildResolution = (overrides: Record<string, unknown> = {}) => ({
      id: 'res-1',
      description: 'Kabel vervangen',
      photos: [{ id: 'rp-1', photoUrl: 'org-1/finding-photos/a.jpg' }],
      finding: {
        id: 'f-1',
        shortDescription: 'Kapotte kabel',
        locationDescription: null,
        normReference: null,
        classificationValues: null,
      },
      ...overrides,
    });

    /** Plan zoals buildDeclarationHtml het (met organization-select) opvraagt. */
    const declarationPlan = () => ({
      projectName: 'Demo-inspectie',
      referenceNumber: 'RAP-1',
      plannedDate: null,
      addressStreet: 'Zuidas',
      addressHouseNumber: '1',
      addressPostalCode: '1234 AB',
      addressCity: 'Amsterdam',
      organization: { name: 'InspeXi Demo', logoUrl: null, primaryColor: '#1E40AF' },
      inspectionTemplate: null,
    });

    const completeDto = {
      contactName: '  Piet Hersteller  ',
      companyName: '  Herstel BV  ',
      email: ' piet@herstel.nl ',
      resolutionIds: ['res-1'],
    } as any;

    const setupComplete = () => {
      mockPrisma.findingResolution.findMany.mockResolvedValue([buildResolution()]);
      mockPrisma.repairSession.update.mockImplementation(async ({ data }: any) => ({
        ...buildSession(),
        ...data,
      }));
      mockPrisma.inspectionPlan.findFirst.mockResolvedValue(declarationPlan());
      mockPrisma.finding.findMany.mockResolvedValue([{ id: 'f-1' }]);
      mockStorage.download.mockResolvedValue(Buffer.from('img'));
      mockPrisma.generatedDocument.create.mockImplementation(async ({ data }: any) => ({
        id: 'doc-new',
        htmlContent: data.htmlContent,
      }));
      mockPrisma.generatedDocument.delete.mockResolvedValue({});
    };

    describe('complete', () => {
      it('eist een e-mailadres voor een ANONYMOUS-sessie zonder sessie-e-mail', async () => {
        await expect(
          service.complete(buildSession(), {
            contactName: 'Piet',
            resolutionIds: ['res-1'],
          } as any),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.complete(buildSession(), {
            contactName: 'Piet',
            resolutionIds: ['res-1'],
          } as any),
        ).rejects.toThrow(/E-mailadres/);
        expect(mockPrisma.findingResolution.findMany).not.toHaveBeenCalled();
      });

      it('weigert een selectie met een resolutie die niet (REPORTED) van deze sessie is', async () => {
        // De query geeft er maar één terug voor twee gevraagde ids.
        mockPrisma.findingResolution.findMany.mockResolvedValue([buildResolution()]);

        await expect(
          service.complete(buildSession(), {
            contactName: 'Piet',
            email: 'piet@herstel.nl',
            resolutionIds: ['res-1', 'res-vreemd'],
          } as any),
        ).rejects.toThrow(BadRequestException);

        // De selectie is sessie-gescoped én beperkt tot doorgevoerde (REPORTED) meldingen.
        expect(mockPrisma.findingResolution.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: { in: ['res-1', 'res-vreemd'] },
              repairSessionId: 'sess-1',
              statusCode: RESOLUTION_REPORTED,
            },
          }),
        );
        expect(mockPrisma.repairSession.update).not.toHaveBeenCalled();
        expect(mockPrisma.generatedDocument.create).not.toHaveBeenCalled();
      });

      it('weigert een melding zonder bewijsfoto', async () => {
        mockPrisma.findingResolution.findMany.mockResolvedValue([
          buildResolution({ photos: [] }),
        ]);

        await expect(service.complete(buildSession(), completeDto)).rejects.toThrow(
          /bewijsfoto/,
        );
        expect(mockPrisma.repairSession.update).not.toHaveBeenCalled();
      });

      it('slaat invullergegevens op, vervangt het oude concept en maakt een DRAFT-verklaring met PENDING-handtekening', async () => {
        setupComplete();
        // Er hangt al een eerder concept aan de sessie.
        mockPrisma.generatedDocument.findFirst.mockResolvedValue({
          id: 'doc-old',
          status: GeneratedDocumentStatus.DRAFT,
        });

        const result = await service.complete(
          buildSession({ generatedDocumentId: 'doc-old' }),
          completeDto,
        );

        // Invullergegevens getrimd op de sessie (PRD §14.5).
        expect(mockPrisma.repairSession.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'sess-1' },
          data: {
            contactName: 'Piet Hersteller',
            companyName: 'Herstel BV',
            email: 'piet@herstel.nl',
          },
        });

        // Het niet-ondertekende concept is verwijderd (vervangen, niet gestapeld).
        expect(mockPrisma.generatedDocument.delete).toHaveBeenCalledWith({
          where: { id: 'doc-old' },
        });

        // Nieuw document: HERSTELVERKLARING in DRAFT met geneste HERSTELLER-handtekening.
        const createData = mockPrisma.generatedDocument.create.mock.calls[0][0].data;
        expect(createData).toEqual(
          expect.objectContaining({
            orgId: 'org-1',
            inspectionPlanId: 'plan-1',
            documentType: DocumentType.HERSTELVERKLARING,
            status: GeneratedDocumentStatus.DRAFT,
          }),
        );
        expect(createData.signatures.create).toEqual(
          expect.objectContaining({
            signerRoleCode: 'HERSTELLER',
            signerName: 'Piet Hersteller',
            signerEmail: 'piet@herstel.nl',
            status: SignatureStatus.PENDING,
          }),
        );

        // De HTML bevat de kern (template zelf heeft z'n eigen spec); de foto is
        // via de gemockte thumbnail als data-URI ingesloten.
        expect(createData.htmlContent).toContain('Kapotte kabel');
        expect(createData.htmlContent).toContain('Kabel vervangen');
        // Handlebars escapet de '='-padding als &#x3D; → alleen op de prefix matchen.
        expect(createData.htmlContent).toContain('data:image/jpeg;base64,dGh1bWI');
        expect(makeThumbnail).toHaveBeenCalledWith(Buffer.from('img'), 800);

        // De sessie wijst daarna naar het nieuwe document.
        expect(mockPrisma.repairSession.update).toHaveBeenNthCalledWith(2, {
          where: { id: 'sess-1' },
          data: { generatedDocumentId: 'doc-new' },
        });

        expect(result).toEqual({ documentId: 'doc-new', htmlPreview: createData.htmlContent });
      });

      it('laat een al ondertekende verklaring staan (geen delete)', async () => {
        setupComplete();
        mockPrisma.generatedDocument.findFirst.mockResolvedValue({
          id: 'doc-old',
          status: GeneratedDocumentStatus.SIGNED,
        });

        await service.complete(buildSession({ generatedDocumentId: 'doc-old' }), completeDto);

        expect(mockPrisma.generatedDocument.delete).not.toHaveBeenCalled();
        expect(mockPrisma.generatedDocument.create).toHaveBeenCalledTimes(1);
      });

      it('accepteert een CLIENT_USER-sessie zonder dto-e-mail via de sessie-e-mail', async () => {
        setupComplete();

        const result = await service.complete(
          buildSession({
            accessType: RepairAccessType.CLIENT_USER,
            clientUserId: 'cu-1',
            email: 'k@klant.nl',
          }),
          { contactName: 'Kees Klant', resolutionIds: ['res-1'] } as any,
        );

        expect(mockPrisma.repairSession.update).toHaveBeenNthCalledWith(1, {
          where: { id: 'sess-1' },
          data: { contactName: 'Kees Klant', companyName: null, email: 'k@klant.nl' },
        });
        expect(result.documentId).toBe('doc-new');
      });
    });

    describe('sign', () => {
      // htmlContent met de echte template-markers zodat de injectie kan vervangen.
      const htmlWithMarkers =
        'KOP<!--SIG_IMG_START--><div style="height:90px"></div><!--SIG_IMG_END-->MIDDEN' +
        '<!--SIG_META_START-->Nog niet ondertekend<!--SIG_META_END-->STAART';

      const buildDocument = (overrides: Record<string, unknown> = {}) => ({
        id: 'doc-1',
        status: GeneratedDocumentStatus.DRAFT,
        htmlContent: htmlWithMarkers,
        signatures: [
          {
            id: 'sig-1',
            signerRoleCode: 'HERSTELLER',
            status: SignatureStatus.PENDING,
            signerName: 'Oude Naam',
            signerEmail: null,
          },
        ],
        ...overrides,
      });

      const signSession = (overrides: Record<string, unknown> = {}) =>
        buildSession({
          generatedDocumentId: 'doc-1',
          contactName: 'Piet Hersteller',
          email: 'piet@herstel.nl',
          ...overrides,
        });

      const signDto = { signatureImage: 'data:image/png;base64,SIG' } as any;

      it('weigert zonder afgeronde verklaring (geen generatedDocumentId)', async () => {
        await expect(service.sign(buildSession(), signDto)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockPrisma.generatedDocument.findFirst).not.toHaveBeenCalled();
      });

      it('weigert een al ondertekend document', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue(
          buildDocument({ status: GeneratedDocumentStatus.SIGNED }),
        );

        await expect(service.sign(signSession(), signDto)).rejects.toThrow(/al ondertekend/);
        expect(mockPrisma.documentSignature.update).not.toHaveBeenCalled();
      });

      it('weigert zonder openstaande HERSTELLER-handtekening', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue(
          buildDocument({
            signatures: [
              { id: 'sig-1', signerRoleCode: 'HERSTELLER', status: SignatureStatus.SIGNED },
            ],
          }),
        );

        await expect(service.sign(signSession(), signDto)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockPdf.renderPdf).not.toHaveBeenCalled();
      });

      it('weigert een niet-ACTIVE sessie', async () => {
        await expect(
          service.sign(signSession({ status: RepairSessionStatus.COMPLETED }), signDto),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.generatedDocument.findFirst).not.toHaveBeenCalled();
      });

      it('tekent, rendert de PDF, zet document SIGNED + sessie COMPLETED en dispatcht met PDF-bijlage', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue(buildDocument());
        mockPrisma.documentSignature.update.mockResolvedValue({});
        mockPrisma.generatedDocument.update.mockResolvedValue({});
        mockPrisma.repairSession.update.mockImplementation(async ({ data }: any) => ({
          ...signSession(),
          ...data,
        }));

        const result = await service.sign(signSession(), signDto, '1.2.3.4');
        await flush();

        // Document opgehaald binnen org + documenttype.
        expect(mockPrisma.generatedDocument.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: 'doc-1',
              orgId: 'org-1',
              documentType: DocumentType.HERSTELVERKLARING,
            },
          }),
        );

        // Handtekening: SIGNED + tijdstip + IP + afbeelding (naam/e-mail van de sessie).
        expect(mockPrisma.documentSignature.update).toHaveBeenCalledWith({
          where: { id: 'sig-1' },
          data: expect.objectContaining({
            signatureImage: 'data:image/png;base64,SIG',
            signerName: 'Piet Hersteller',
            signerEmail: 'piet@herstel.nl',
            signedAt: expect.any(Date),
            signedIpAddress: '1.2.3.4',
            status: SignatureStatus.SIGNED,
          }),
        });

        // Document: SIGNED + pdfUrl + geïnjecteerde handtekening in de HTML.
        const docUpdate = mockPrisma.generatedDocument.update.mock.calls[0][0];
        expect(docUpdate.where).toEqual({ id: 'doc-1' });
        expect(docUpdate.data.status).toBe(GeneratedDocumentStatus.SIGNED);
        expect(docUpdate.data.pdfUrl).toBe('org-1/documents/doc-1.pdf');
        expect(docUpdate.data.htmlContent).toContain(
          '<img src="data:image/png;base64,SIG" alt="Handtekening" />',
        );
        expect(docUpdate.data.htmlContent).toContain('(IP: 1.2.3.4)');
        expect(docUpdate.data.htmlContent).not.toContain('Nog niet ondertekend');

        // PDF gerenderd op de definitieve HTML en als application/pdf opgeslagen.
        expect(mockPdf.renderPdf).toHaveBeenCalledWith(docUpdate.data.htmlContent, {});
        expect(mockStorage.upload).toHaveBeenCalledWith(
          'org-1/documents/doc-1.pdf',
          Buffer.from('pdf'),
          'application/pdf',
        );

        // Volgorde (review #6): eerst renderen + uploaden, pas daarna de
        // statusmutaties — faalt Puppeteer/storage, dan is er niets gemuteerd.
        expect(mockPdf.renderPdf.mock.invocationCallOrder[0]).toBeLessThan(
          mockStorage.upload.mock.invocationCallOrder[0],
        );
        expect(mockStorage.upload.mock.invocationCallOrder[0]).toBeLessThan(
          mockPrisma.documentSignature.update.mock.invocationCallOrder[0],
        );

        // Sessie afgerond.
        expect(mockPrisma.repairSession.update).toHaveBeenCalledWith({
          where: { id: 'sess-1' },
          data: { status: RepairSessionStatus.COMPLETED, completedAt: expect.any(Date) },
        });

        // Fire-and-forget dispatch met de PDF als bijlage.
        expect(mockEvents.onDeclarationSigned).toHaveBeenCalledWith(
          expect.objectContaining({ status: RepairSessionStatus.COMPLETED }),
          { filename: 'herstelverklaring-piet-hersteller.pdf', content: Buffer.from('pdf') },
        );

        expect(result).toEqual({
          documentId: 'doc-1',
          status: GeneratedDocumentStatus.SIGNED,
          signedAt: expect.any(Date),
          pdfDownloadUrl: '/api/v1/client/repair/declaration/pdf',
        });
      });

      it('PDF-renderfout → niets gemuteerd; de klant kan opnieuw ondertekenen (review #6)', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue(buildDocument());
        mockPdf.renderPdf.mockRejectedValue(new Error('puppeteer down'));

        await expect(service.sign(signSession(), signDto)).rejects.toThrow('puppeteer down');
        await flush();

        expect(mockStorage.upload).not.toHaveBeenCalled();
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        expect(mockPrisma.documentSignature.update).not.toHaveBeenCalled();
        expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
        expect(mockPrisma.repairSession.update).not.toHaveBeenCalled();
        expect(mockEvents.onDeclarationSigned).not.toHaveBeenCalled();
      });

      it('storage-uploadfout na een geslaagde render → eveneens niets gemuteerd (review #6)', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue(buildDocument());
        mockStorage.upload.mockRejectedValue(new Error('storage weg'));

        await expect(service.sign(signSession(), signDto)).rejects.toThrow('storage weg');
        await flush();

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
        expect(mockPrisma.documentSignature.update).not.toHaveBeenCalled();
        expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
        expect(mockPrisma.repairSession.update).not.toHaveBeenCalled();
        expect(mockEvents.onDeclarationSigned).not.toHaveBeenCalled();
      });
    });

    describe('getDeclarationPdf', () => {
      it('gooit NotFound zonder verklaring op de sessie', async () => {
        await expect(service.getDeclarationPdf(buildSession())).rejects.toThrow(
          NotFoundException,
        );
        expect(mockPrisma.generatedDocument.findFirst).not.toHaveBeenCalled();
      });

      it('gooit NotFound wanneer de verklaring nog geen PDF heeft (niet ondertekend)', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue({ pdfUrl: null });

        await expect(
          service.getDeclarationPdf(buildSession({ generatedDocumentId: 'doc-1' })),
        ).rejects.toThrow(NotFoundException);
        expect(mockStorage.download).not.toHaveBeenCalled();
      });

      it('streamt de opgeslagen PDF met bestandsnaam', async () => {
        mockPrisma.generatedDocument.findFirst.mockResolvedValue({
          pdfUrl: 'org-1/documents/doc-1.pdf',
        });
        mockStorage.download.mockResolvedValue(Buffer.from('pdf-data'));

        const result = await service.getDeclarationPdf(
          buildSession({ generatedDocumentId: 'doc-1' }),
        );

        expect(mockStorage.download).toHaveBeenCalledWith('org-1/documents/doc-1.pdf');
        expect(result).toEqual({
          buffer: Buffer.from('pdf-data'),
          filename: 'herstelverklaring.pdf',
        });
      });
    });
  });
});
