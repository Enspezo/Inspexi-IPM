import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, Role, TimeActivityType, TimeEntrySource, TimesheetStatus } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';
import { PrismaService } from '@/prisma';

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;

  const mockPrisma: any = {
    timeEntry: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    timesheet: { upsert: jest.fn() },
    task: { create: jest.fn(), update: jest.fn() },
    project: { findUnique: jest.fn() },
    inspectionPlan: { findUnique: jest.fn() },
    planningItem: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[]) => ({ id, orgId: ORG, roles }) as any;
  const inspecteur = u('insp-1', [Role.INSPECTEUR]);
  const manager = u('mgr-1', [Role.MANAGER]);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeEntriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(TimeEntriesService);

    // tx-client = zelfde mock; $transaction voert de callback direct uit.
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
    mockPrisma.timeEntry.findUnique.mockResolvedValue(null);
    mockPrisma.timeEntry.findFirst.mockResolvedValue(null); // geen lopende timer
    mockPrisma.timesheet.upsert.mockResolvedValue({ id: 'ts-1', status: TimesheetStatus.CONCEPT });
    mockPrisma.timeEntry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'te-new', ...data }),
    );
    mockPrisma.project.findUnique.mockResolvedValue({ orgId: ORG });
  });

  describe('start — projectregel (PRD-16 §4.3)', () => {
    it('OVERIG zonder project mag', async () => {
      const result = await service.start(inspecteur, {
        activityType: TimeActivityType.OVERIG,
      } as any);
      expect(result.entry.needsProjectAssignment).toBe(false);
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('UITVOERING zonder project → 400', async () => {
      await expect(
        service.start(inspecteur, { activityType: TimeActivityType.UITVOERING } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('REIS_AUTO zonder project → needsProjectAssignment + todo-taak', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 'task-1' });
      const result = await service.start(inspecteur, {
        activityType: TimeActivityType.REISTIJD,
        source: TimeEntrySource.REIS_AUTO,
      } as any);
      expect(result.entry.needsProjectAssignment).toBe(true);
      // Taak-aanmaak is fire-and-forget → even de microtask-queue leeg laten lopen
      await new Promise(process.nextTick);
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entityType: 'TIME_ENTRY', assigneeId: inspecteur.id }),
        }),
      );
      expect(mockPrisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { assignmentTaskId: 'task-1' } }),
      );
    });

    it('REISTIJD handmatig zonder project → 400 (uitzondering is alleen REIS_AUTO)', async () => {
      await expect(
        service.start(inspecteur, { activityType: TimeActivityType.REISTIJD } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('start — één timer tegelijk', () => {
    it('stopt de lopende timer met reden "gewisseld"', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({
        id: 'te-running',
        startedAt: new Date(Date.now() - 30 * 60_000),
      });
      const result = await service.start(inspecteur, {
        activityType: TimeActivityType.UITVOERING,
        projectId: 'proj-1',
      } as any);
      expect(result.stoppedEntry).toEqual({ id: 'te-running' });
      expect(mockPrisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'te-running' },
          data: expect.objectContaining({ stopReason: 'gewisseld' }),
        }),
      );
    });

    it('P2002 op de partial index → nette 409', async () => {
      mockPrisma.timeEntry.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.start(inspecteur, {
          activityType: TimeActivityType.UITVOERING,
          projectId: 'proj-1',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('idempotent op clientId: bestaande regel wordt teruggegeven zonder nieuwe start', async () => {
      mockPrisma.timeEntry.findUnique.mockResolvedValue({ id: 'te-existing' });
      const result = await service.start(inspecteur, {
        activityType: TimeActivityType.UITVOERING,
        projectId: 'proj-1',
        clientId: 'offline-1',
      } as any);
      expect(result.entry.id).toBe('te-existing');
      expect(mockPrisma.timeEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('start — starttijd-validatie', () => {
    it('starttijd in de toekomst → 400', async () => {
      await expect(
        service.start(inspecteur, {
          activityType: TimeActivityType.OVERIG,
          startedAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('starttijd > 12 uur terug → 400', async () => {
      await expect(
        service.start(inspecteur, {
          activityType: TimeActivityType.OVERIG,
          startedAt: new Date(Date.now() - 13 * 60 * 60_000).toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('start — weekstaat-lock', () => {
    it('week al ingediend → 409', async () => {
      mockPrisma.timesheet.upsert.mockResolvedValue({
        id: 'ts-1',
        status: TimesheetStatus.INGEDIEND,
      });
      await expect(
        service.start(inspecteur, { activityType: TimeActivityType.OVERIG } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    const baseEntry = {
      id: 'te-1',
      orgId: ORG,
      userId: inspecteur.id,
      activityType: TimeActivityType.REISTIJD,
      projectId: null,
      startedAt: new Date('2026-08-27T06:00:00Z'),
      endedAt: new Date('2026-08-27T07:00:00Z'),
      needsProjectAssignment: true,
      assignmentTaskId: 'task-1',
      timesheetId: 'ts-1',
      timesheet: { id: 'ts-1', status: TimesheetStatus.CONCEPT },
    };

    it('eigenaar mag niet wijzigen in een ingediende week → 409', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({
        ...baseEntry,
        timesheet: { id: 'ts-1', status: TimesheetStatus.INGEDIEND },
      });
      await expect(
        service.update('te-1', inspecteur, { notes: 'x' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('manager-correctie mag wél op een ingediende week en zet correctedById', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({
        ...baseEntry,
        needsProjectAssignment: false,
        activityType: TimeActivityType.UITVOERING,
        projectId: 'proj-1',
        timesheet: { id: 'ts-1', status: TimesheetStatus.INGEDIEND },
      });
      mockPrisma.timeEntry.update.mockResolvedValue({ id: 'te-1' });
      await service.update('te-1', manager, { notes: 'correctie' } as any);
      expect(mockPrisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ correctedById: manager.id }),
        }),
      );
    });

    it('goedgekeurde week is bevroren, ook voor managers → 409', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({
        ...baseEntry,
        timesheet: { id: 'ts-1', status: TimesheetStatus.GOEDGEKEURD },
      });
      await expect(service.update('te-1', manager, { notes: 'x' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('andere staf zonder managementrol → 403', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(baseEntry);
      await expect(
        service.update('te-1', u('bo-1', [Role.BACKOFFICE]), { notes: 'x' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('project toewijzen aan REIS_AUTO-regel wist de vlag en voltooit de taak', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(baseEntry);
      mockPrisma.timeEntry.update.mockResolvedValue({ id: 'te-1' });
      mockPrisma.task.update.mockResolvedValue({});
      await service.update('te-1', inspecteur, { projectId: 'proj-1' } as any);
      expect(mockPrisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ needsProjectAssignment: false }),
        }),
      );
      await new Promise(process.nextTick);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'VOLTOOID' },
      });
    });

    it('project weghalen bij niet-OVERIG → 400', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({
        ...baseEntry,
        activityType: TimeActivityType.UITVOERING,
        projectId: 'proj-1',
        needsProjectAssignment: false,
      });
      await expect(
        service.update('te-1', inspecteur, { projectId: null } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('applySyncChange (PRD-16 fase 2 — offline-buffer via /sync)', () => {
    const CLIENT_ID = '7b9e6c1a-1234-4abc-8def-0123456789ab';
    const payload = (extra: Record<string, unknown> = {}) => ({
      id: CLIENT_ID,
      activityType: 'UITVOERING',
      source: 'AGENDA',
      projectId: 'proj-1',
      startedAt: '2026-08-27T06:00:00.000Z',
      endedAt: '2026-08-27T08:30:00.000Z',
      ...extra,
    });

    it('create adopteert het client-UUID als id én clientId en berekent de duur', async () => {
      await service.applySyncChange(inspecteur, 'create', payload());
      expect(mockPrisma.timeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: CLIENT_ID,
            clientId: CLIENT_ID,
            userId: inspecteur.id,
            durationMinutes: 150,
          }),
        }),
      );
    });

    it('idempotente retry: bestaande clientId → succes zonder nieuwe create', async () => {
      mockPrisma.timeEntry.findUnique.mockResolvedValue({ id: CLIENT_ID, userId: inspecteur.id });
      const r = await service.applySyncChange(inspecteur, 'create', payload());
      expect(r.id).toBe(CLIENT_ID);
      expect(mockPrisma.timeEntry.create).not.toHaveBeenCalled();
    });

    it('lopende regel (geen endedAt) wordt geweigerd', async () => {
      await expect(
        service.applySyncChange(inspecteur, 'create', payload({ endedAt: undefined })),
      ).rejects.toThrow(BadRequestException);
    });

    it('update op een regel die de server nog niet kent → toegepast als create', async () => {
      await service.applySyncChange(inspecteur, 'update', payload());
      expect(mockPrisma.timeEntry.create).toHaveBeenCalled();
    });

    it("update op andermans regel → 403", async () => {
      mockPrisma.timeEntry.findUnique.mockResolvedValue({
        id: CLIENT_ID,
        userId: 'iemand-anders',
        timesheet: { id: 'ts-1', status: TimesheetStatus.CONCEPT },
      });
      await expect(
        service.applySyncChange(inspecteur, 'update', payload()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('update in een ingediende week → 409', async () => {
      mockPrisma.timeEntry.findUnique.mockResolvedValue({
        id: CLIENT_ID,
        userId: inspecteur.id,
        needsProjectAssignment: false,
        startedAt: new Date('2026-08-27T06:00:00Z'),
        timesheetId: 'ts-1',
        timesheet: { id: 'ts-1', status: TimesheetStatus.INGEDIEND },
      });
      await expect(
        service.applySyncChange(inspecteur, 'update', payload()),
      ).rejects.toThrow(ConflictException);
    });

    it('delete is idempotent voor een onbekende regel', async () => {
      const r = await service.applySyncChange(inspecteur, 'delete', { id: CLIENT_ID });
      expect(r.id).toBe(CLIENT_ID);
      expect(mockPrisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('ongeldig id → 400', async () => {
      await expect(
        service.applySyncChange(inspecteur, 'create', payload({ id: 'geen-uuid' })),
      ).rejects.toThrow(BadRequestException);
    });
  });

});
