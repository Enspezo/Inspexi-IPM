import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { MeasurementInstrumentsScheduler } from './measurement-instruments.scheduler';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('MeasurementInstrumentsScheduler', () => {
  let scheduler: MeasurementInstrumentsScheduler;

  const mockPrisma = {
    measurementInstrument: { findMany: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const mockNotifications = { dispatch: jest.fn() };

  const NOW = new Date('2026-06-25T08:00:00.000Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementInstrumentsScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    scheduler = module.get(MeasurementInstrumentsScheduler);
  });

  it('notifies expired instruments (stage "expired") to assignee + org admins and dedupes already-notified ones', async () => {
    mockPrisma.measurementInstrument.findMany.mockResolvedValue([
      {
        id: 'A',
        orgId: 'org-1',
        code: 'MM-001',
        brand: 'Fluke',
        type: '1587',
        assignedToUserId: 'insp-1',
        nextCalibrationDue: new Date('2026-05-01'), // verleden → expired
        lastExpiryNotifiedStage: null,
      },
      {
        id: 'B',
        orgId: 'org-1',
        code: 'MM-002',
        brand: 'Megger',
        type: '430',
        assignedToUserId: null,
        nextCalibrationDue: new Date('2026-07-10'), // binnen 30d → '30d'
        lastExpiryNotifiedStage: '30d', // al genotificeerd → skip
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

    const sent = await scheduler.processDueCalibrations(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
    const arg = mockNotifications.dispatch.mock.calls[0][0];
    expect(arg.type).toBe(NotificationType.MEETMIDDEL_KALIBRATIE_VERLOPEN);
    expect(arg.recipientUserIds).toEqual(expect.arrayContaining(['insp-1', 'admin-1']));
    expect(arg.entityType).toBe('measurementInstrument');
    expect(arg.entityId).toBe('A');

    // Stage gemarkeerd als verstuurd (dedupe voor de volgende run).
    expect(mockPrisma.measurementInstrument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'A' },
        data: expect.objectContaining({ lastExpiryNotifiedStage: 'expired' }),
      }),
    );
  });

  it('sends the BINNENKORT notification for a not-yet-notified soon-due instrument', async () => {
    mockPrisma.measurementInstrument.findMany.mockResolvedValue([
      {
        id: 'C',
        orgId: 'org-1',
        code: 'MM-003',
        brand: 'GMC',
        type: 'PT',
        assignedToUserId: 'insp-2',
        nextCalibrationDue: new Date('2026-07-10'),
        lastExpiryNotifiedStage: null,
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const sent = await scheduler.processDueCalibrations(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch.mock.calls[0][0].type).toBe(
      NotificationType.MEETMIDDEL_KALIBRATIE_BINNENKORT,
    );
  });

  it('does nothing when no instruments are due', async () => {
    mockPrisma.measurementInstrument.findMany.mockResolvedValue([]);
    const sent = await scheduler.processDueCalibrations(NOW);
    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
  });
});
