import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Role, PlanningStatus, SessionStatus } from '@prisma/client';
import { PlanningSessionsService } from './planning-sessions.service';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanningEmailService } from './planning-email.service';

// Dekt de PRD-12 §12.9 beschikbaarheids-soft-check op het SESSIE-pad. De
// resolutielogica zelf is elders getest (planning.service + planning-availability
// e2e); hier borgen we alleen de bedrading: assignSessionInspectors roept
// assertInspectorAvailability aan, propageert de 409 en logt de override.
describe('PlanningSessionsService — availability wiring (PRD-12 §12.9)', () => {
  let service: PlanningSessionsService;

  const mockPrisma = {
    planningSession: { findUnique: jest.fn(), update: jest.fn() },
    planningSessionInspector: { deleteMany: jest.fn(), upsert: jest.fn() },
    planningInspector: { upsert: jest.fn() },
    planningItem: { update: jest.fn() },
    user: { findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
  };

  const mockPlanning = {
    findOne: jest.fn(),
    assertInspectorAvailability: jest.fn(),
    addHistoryEntry: jest.fn().mockResolvedValue(undefined),
    logAvailabilityOverride: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotifications = { dispatch: jest.fn() };
  const mockPlanningEmail = {
    sendConfirmation: jest.fn(),
    sendSessionConfirmation: jest.fn(),
  };

  const user = { id: 'user-1', orgId: 'org-1', roles: [Role.ORG_ADMIN] } as any;

  const multiDayItem = {
    id: 'item-1',
    orgId: 'org-1',
    isMultiDay: true,
    durationHours: 8,
    status: PlanningStatus.NOG_TE_PLANNEN,
    productName: 'Inspectie',
  };

  const session = {
    id: 'sess-1',
    planningItemId: 'item-1',
    sessionNumber: 1,
    status: SessionStatus.NOG_TE_PLANNEN,
    scheduledDate: new Date('2026-09-08T00:00:00.000Z'),
    durationHours: 4,
    sessionInspectors: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningSessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: PlanningEmailService, useValue: mockPlanningEmail },
        { provide: PlanningService, useValue: mockPlanning },
      ],
    }).compile();
    service = moduleRef.get(PlanningSessionsService);

    mockPlanning.findOne.mockResolvedValue(multiDayItem);
    mockPrisma.planningSession.findUnique.mockResolvedValue(session);
    // assertAllSameOrg → user.findMany moet alle inspecteur-ids terugvinden.
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    mockPrisma.planningSessionInspector.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.planningSessionInspector.upsert.mockResolvedValue({});
    mockPrisma.planningInspector.upsert.mockResolvedValue({});
    mockPrisma.planningSession.update.mockResolvedValue({});
    mockPrisma.planningItem.update.mockResolvedValue({});
  });

  it('propageert de 409 bij onbeschikbaarheid en wijst niets toe', async () => {
    mockPlanning.assertInspectorAvailability.mockRejectedValue(
      new ConflictException({ success: false, message: 'onbeschikbaar', warnings: [] }),
    );

    await expect(
      service.assignSessionInspectors('item-1', 'sess-1', { inspectorIds: ['user-1'] } as any, user),
    ).rejects.toThrow(ConflictException);

    expect(mockPlanning.assertInspectorAvailability).toHaveBeenCalledWith(
      session.scheduledDate,
      session.durationHours,
      ['user-1'],
      undefined,
    );
    // Geen toewijzing bij een conflict.
    expect(mockPrisma.planningSessionInspector.upsert).not.toHaveBeenCalled();
  });

  it('wijst toe en logt de override wanneer de check waarschuwingen teruggeeft', async () => {
    const warnings = [{ userId: 'user-1', name: 'Jan', date: '2026-09-08', reason: 'GEBLOKKEERD' }];
    mockPlanning.assertInspectorAvailability.mockResolvedValue(warnings);

    // Enige inspecteur == actor → notify-set leeg, geen e-mail-staart nodig.
    await service.assignSessionInspectors(
      'item-1',
      'sess-1',
      { inspectorIds: ['user-1'], overrideAvailabilityWarnings: true } as any,
      user,
    );

    expect(mockPrisma.planningSessionInspector.upsert).toHaveBeenCalledTimes(1);
    expect(mockPlanning.logAvailabilityOverride).toHaveBeenCalledWith(
      'item-1',
      'user-1',
      warnings,
      expect.stringContaining('sessie 1'),
    );
  });
});
