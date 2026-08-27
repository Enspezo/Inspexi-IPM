import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role, TimesheetStatus } from '@prisma/client';
import { TimesheetsService } from './timesheets.service';
import { TimeEntriesService } from './time-entries.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '@/prisma';

describe('TimesheetsService', () => {
  let service: TimesheetsService;

  const mockPrisma: any = {
    timesheet: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    timeEntry: {
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findMany: jest.fn() },
  };
  const notifications = { dispatch: jest.fn() };
  const timeEntries = { buildWhere: jest.fn().mockReturnValue({}) };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[]) =>
    ({ id, orgId: ORG, roles, firstName: 'Test', lastName: 'User' }) as any;
  const inspecteur = u('insp-1', [Role.INSPECTEUR]);
  const manager = u('mgr-1', [Role.MANAGER]);

  const baseSheet = {
    id: 'ts-1',
    orgId: ORG,
    userId: inspecteur.id,
    year: 2026,
    weekNumber: 35,
    status: TimesheetStatus.CONCEPT,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: TimeEntriesService, useValue: timeEntries },
      ],
    }).compile();
    service = module.get(TimesheetsService);

    mockPrisma.timeEntry.groupBy.mockResolvedValue([]);
    mockPrisma.timeEntry.aggregate.mockResolvedValue({ _sum: { durationMinutes: 480 } });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'mgr-1' }]);
  });

  describe('submit', () => {
    beforeEach(() => {
      mockPrisma.timesheet.findFirst.mockResolvedValue({ ...baseSheet });
      // [lopende timers, niet-toegewezen reistijd, totaal regels]
      mockPrisma.timeEntry.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);
      mockPrisma.timesheet.update.mockResolvedValue({
        ...baseSheet,
        status: TimesheetStatus.INGEDIEND,
      });
    });

    it('CONCEPT → INGEDIEND + notificatie naar goedkeurders', async () => {
      const result = await service.submit('ts-1', inspecteur);
      expect(result.status).toBe(TimesheetStatus.INGEDIEND);
      await new Promise(process.nextTick);
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WEEKSTAAT_INGEDIEND', recipientUserIds: ['mgr-1'] }),
      );
    });

    it('alleen de eigenaar mag indienen → 403', async () => {
      await expect(service.submit('ts-1', manager)).rejects.toThrow(ForbiddenException);
    });

    it('lopende timer in de week → 409', async () => {
      mockPrisma.timeEntry.count.mockReset();
      mockPrisma.timeEntry.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);
      await expect(service.submit('ts-1', inspecteur)).rejects.toThrow(ConflictException);
    });

    it('niet-toegewezen reistijd-regel → 409', async () => {
      mockPrisma.timeEntry.count.mockReset();
      mockPrisma.timeEntry.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(5);
      await expect(service.submit('ts-1', inspecteur)).rejects.toThrow(ConflictException);
    });

    it('lege weekstaat → 409', async () => {
      mockPrisma.timeEntry.count.mockReset();
      mockPrisma.timeEntry.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      await expect(service.submit('ts-1', inspecteur)).rejects.toThrow(ConflictException);
    });

    it('al goedgekeurd → 409', async () => {
      mockPrisma.timesheet.findFirst.mockResolvedValue({
        ...baseSheet,
        status: TimesheetStatus.GOEDGEKEURD,
      });
      await expect(service.submit('ts-1', inspecteur)).rejects.toThrow(ConflictException);
    });
  });

  describe('approve / reject', () => {
    it('approve: INGEDIEND → GOEDGEKEURD + notificatie naar de inspecteur', async () => {
      mockPrisma.timesheet.findFirst.mockResolvedValue({
        ...baseSheet,
        status: TimesheetStatus.INGEDIEND,
      });
      mockPrisma.timesheet.update.mockResolvedValue({
        ...baseSheet,
        status: TimesheetStatus.GOEDGEKEURD,
      });
      await service.approve('ts-1', manager);
      expect(mockPrisma.timesheet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TimesheetStatus.GOEDGEKEURD,
            reviewedById: manager.id,
          }),
        }),
      );
      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WEEKSTAAT_GOEDGEKEURD',
          recipientUserIds: [inspecteur.id],
        }),
      );
    });

    it('reject op een CONCEPT-weekstaat → 409', async () => {
      mockPrisma.timesheet.findFirst.mockResolvedValue({ ...baseSheet });
      await expect(service.reject('ts-1', manager, 'Onvolledig')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll — scoping', () => {
    it('INSPECTEUR ziet alleen eigen weekstaten, ook met userId-filter van een ander', async () => {
      mockPrisma.timesheet.findMany.mockResolvedValue([]);
      mockPrisma.timesheet.count.mockResolvedValue(0);
      await service.findAll(inspecteur, { userId: 'iemand-anders' } as any);
      expect(mockPrisma.timesheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: inspecteur.id }),
        }),
      );
    });
  });
});
