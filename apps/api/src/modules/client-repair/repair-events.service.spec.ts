// Event-dispatch van de herstel-flow (PRD-14 §14.8, fase 3): PM-notificaties
// (HERSTEL_AFGEROND / HERSTEL_CONFLICT / HERINSPECTIE_VOORSTEL) + directe
// e-mails naar invuller/opdrachtgever/PM, met de PM-fallback-keten uit besluit 7.
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { RepairEventsService } from './repair-events.service';
import { RepairEmailService } from './repair-email.service';
import { PrismaService } from '@/prisma';
import { RESOLUTION_REPORTED } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';

describe('RepairEventsService', () => {
  let service: RepairEventsService;

  const mockPrisma = {
    inspectionPlan: { findUnique: jest.fn() },
    finding: { findUnique: jest.fn() },
    findingResolution: { findFirst: jest.fn() },
    findingResolutionPhoto: { count: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  const mockNotifications = { dispatch: jest.fn() };

  const mockEmail = {
    sendDeclarationConfirmation: jest.fn(),
    sendConflictNotice: jest.fn(),
    sendReinspectionProposal: jest.fn(),
  };

  /** Plan-context zoals loadPlanContext die selecteert. */
  const buildPlanContext = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    orgId: 'org-1',
    projectName: 'Demo-inspectie',
    referenceNumber: 'RAP-1',
    reviewerId: null,
    assignedTo: null,
    project: null,
    contact: {
      email: 'klant@bedrijf.nl',
      companyName: 'Klant BV',
      firstName: 'Kees',
      lastName: 'Klant',
    },
    organization: { name: 'InspeXi Demo' },
    ...overrides,
  });

  const buildSession = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'sess-1',
      orgId: 'org-1',
      inspectionPlanId: 'plan-1',
      contactName: 'Piet Hersteller',
      email: 'piet@herstel.nl',
      ...overrides,
    }) as any;

  const pdf = { filename: 'herstelverklaring-piet.pdf', content: Buffer.from('pdf') };

  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepairEventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: RepairEmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<RepairEventsService>(RepairEventsService);

    mockEmail.sendDeclarationConfirmation.mockResolvedValue(undefined);
    mockEmail.sendConflictNotice.mockResolvedValue(undefined);
    mockEmail.sendReinspectionProposal.mockResolvedValue(undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ── onDeclarationSigned ─────────────────────────────────

  describe('onDeclarationSigned', () => {
    it('notificeert de PM (project.projectManagerId wint) en mailt invuller + opdrachtgever', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({
          project: { projectManagerId: 'pm-1' },
          reviewerId: 'rev-1',
          assignedTo: 'insp-1',
        }),
      );

      await service.onDeclarationSigned(buildSession(), pdf);

      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.HERSTEL_AFGEROND,
          orgId: 'org-1',
          recipientUserIds: ['pm-1'],
          entityType: 'inspectionPlan',
          entityId: 'plan-1',
        }),
      );

      // Twee bevestigingen: eerst de invuller (sessie-e-mail), dan de opdrachtgever.
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledTimes(2);
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'piet@herstel.nl',
          recipientName: 'Piet Hersteller',
          orgName: 'InspeXi Demo',
          referenceNumber: 'RAP-1',
          attachment: pdf,
        }),
      );
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: 'klant@bedrijf.nl',
          recipientName: 'Klant BV',
          attachment: pdf,
        }),
      );
    });

    it('mailt maar één keer wanneer de opdrachtgever hetzelfde e-mailadres heeft als de invuller', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({
          project: { projectManagerId: 'pm-1' },
          contact: { email: 'piet@herstel.nl', companyName: 'Klant BV', firstName: null, lastName: null },
        }),
      );

      await service.onDeclarationSigned(buildSession(), pdf);

      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'piet@herstel.nl' }),
      );
    });

    it('slaat de opdrachtgever-mail over (met warn) wanneer het contact geen e-mailadres heeft', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({
          project: { projectManagerId: 'pm-1' },
          contact: { email: null, companyName: 'Klant BV', firstName: null, lastName: null },
        }),
      );

      await service.onDeclarationSigned(buildSession(), pdf);

      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'piet@herstel.nl' }),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zonder e-mailadres'));
    });

    it('verstuurt zonder PM (project/reviewer/assignedTo allemaal null) geen notificatie maar wél de e-mails', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({ project: null, reviewerId: null, assignedTo: null }),
      );

      await service.onDeclarationSigned(buildSession(), pdf);

      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Geen projectmanager'));
      expect(mockEmail.sendDeclarationConfirmation).toHaveBeenCalledTimes(2);
    });
  });

  // ── onRepairConflict ────────────────────────────────────

  describe('onRepairConflict', () => {
    const conflictResolution = { id: 'res-conflict', description: 'Te laat gemeld' } as any;

    const setupConflict = (planOverrides: Record<string, unknown> = {}) => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({ reviewerId: 'rev-1', ...planOverrides }),
      );
      mockPrisma.finding.findUnique.mockResolvedValue({ shortDescription: 'Kapotte kabel' });
      mockPrisma.findingResolution.findFirst.mockResolvedValue({
        description: 'Eerder hersteld',
        _count: { photos: 2 },
      });
      mockPrisma.findingResolutionPhoto.count.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'pm@org.nl' });
    };

    it('notificeert de PM via de fallback (reviewerId zonder project) met HERSTEL_CONFLICT', async () => {
      setupConflict();

      await service.onRepairConflict(buildSession(), 'f-1', conflictResolution);

      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.HERSTEL_CONFLICT,
          orgId: 'org-1',
          recipientUserIds: ['rev-1'],
          entityType: 'inspectionPlan',
          entityId: 'plan-1',
        }),
      );
      // De winnaar is de (oudste) REPORTED-resolutie van de constatering.
      expect(mockPrisma.findingResolution.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { findingId: 'f-1', statusCode: RESOLUTION_REPORTED },
          orderBy: { resolvedAt: 'asc' },
        }),
      );
    });

    it('mailt opdrachtgever én PM met winnaar/verliezer-omschrijvingen + foto-aantallen', async () => {
      setupConflict();

      await service.onRepairConflict(buildSession(), 'f-1', conflictResolution);

      expect(mockEmail.sendConflictNotice).toHaveBeenCalledTimes(2);
      expect(mockEmail.sendConflictNotice).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'klant@bedrijf.nl',
          findingDescription: 'Kapotte kabel',
          winner: { description: 'Eerder hersteld', photoCount: 2 },
          loser: { description: 'Te laat gemeld', photoCount: 1 },
        }),
      );
      // PM per directe e-mail via de user-lookup.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rev-1' } }),
      );
      expect(mockEmail.sendConflictNotice).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: 'pm@org.nl',
          winner: { description: 'Eerder hersteld', photoCount: 2 },
          loser: { description: 'Te laat gemeld', photoCount: 1 },
        }),
      );
    });

    it('mailt alleen de PM wanneer de opdrachtgever geen e-mailadres heeft', async () => {
      setupConflict({
        contact: { email: null, companyName: 'Klant BV', firstName: null, lastName: null },
      });

      await service.onRepairConflict(buildSession(), 'f-1', conflictResolution);

      expect(mockEmail.sendConflictNotice).toHaveBeenCalledTimes(1);
      expect(mockEmail.sendConflictNotice).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'pm@org.nl' }),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zonder e-mailadres'));
    });
  });

  // ── onAllCriticalRepaired ───────────────────────────────

  describe('onAllCriticalRepaired', () => {
    it('dispatcht HERINSPECTIE_VOORSTEL naar de PM en mailt het voorstel naar de opdrachtgever', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({ project: { projectManagerId: 'pm-1' } }),
      );

      await service.onAllCriticalRepaired('plan-1', 'org-1');

      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.HERINSPECTIE_VOORSTEL,
          orgId: 'org-1',
          recipientUserIds: ['pm-1'],
          entityType: 'inspectionPlan',
          entityId: 'plan-1',
        }),
      );
      expect(mockEmail.sendReinspectionProposal).toHaveBeenCalledWith({
        to: 'klant@bedrijf.nl',
        orgName: 'InspeXi Demo',
        referenceNumber: 'RAP-1',
        projectName: 'Demo-inspectie',
      });
    });

    it('doet niets bij een org-mismatch tussen plan en aanroep', async () => {
      mockPrisma.inspectionPlan.findUnique.mockResolvedValue(
        buildPlanContext({ project: { projectManagerId: 'pm-1' } }),
      );

      await service.onAllCriticalRepaired('plan-1', 'andere-org');

      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
      expect(mockEmail.sendReinspectionProposal).not.toHaveBeenCalled();
    });
  });
});
