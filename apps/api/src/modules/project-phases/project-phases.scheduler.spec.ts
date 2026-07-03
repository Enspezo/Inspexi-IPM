import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { ProjectPhasesScheduler } from './project-phases.scheduler';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';

describe('ProjectPhasesScheduler', () => {
  let scheduler: ProjectPhasesScheduler;

  const mockPrisma = {
    phaseMilestone: { findMany: jest.fn(), update: jest.fn() },
  };
  const mockNotifications = { dispatch: jest.fn() };
  // Standaard: elke org heeft PROJECT_FASEN. Individuele tests overschrijven dit.
  const mockEntitlements = {
    getEnabledFeatures: jest
      .fn()
      .mockResolvedValue(['BASIS_UITVOERING', 'PROJECT_FASEN']),
  };

  const NOW = new Date('2026-07-02T06:00:00.000Z');

  // Helper: a milestone row as returned by the scheduler's findMany select.
  const milestone = (over: any = {}) => ({
    id: 'm-1',
    orgId: 'org-1',
    title: 'Rapportage gereed',
    dueDate: new Date('2026-07-05'), // 3 dagen weg
    reminderDaysBefore: 7,
    assigneeId: 'insp-1',
    lastReminderStage: null,
    phase: {
      id: 'phase-1',
      name: 'Verdieping Noord',
      followers: [{ userId: 'follower-1' }],
      project: { projectManagerId: 'pm-1' },
    },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // clearAllMocks wist calls maar niet de implementatie; zet de default terug
    // zodat een test-override (skip-scenario) niet naar de volgende test lekt.
    mockEntitlements.getEnabledFeatures.mockResolvedValue([
      'BASIS_UITVOERING',
      'PROJECT_FASEN',
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPhasesScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: EntitlementsService, useValue: mockEntitlements },
      ],
    }).compile();
    scheduler = module.get(ProjectPhasesScheduler);
  });

  it('sends an "upcoming" reminder for a milestone within its reminder window', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([milestone()]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
    const arg = mockNotifications.dispatch.mock.calls[0][0];
    expect(arg.type).toBe(NotificationType.MILESTONE_HERINNERING);
    expect(arg.entityType).toBe('projectPhase');
    expect(arg.entityId).toBe('phase-1');
    // assignee + PM + interne fasevolger, gededupliceerd.
    expect(arg.recipientUserIds).toEqual(
      expect.arrayContaining(['insp-1', 'pm-1', 'follower-1']),
    );
    expect(mockPrisma.phaseMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm-1' },
        data: expect.objectContaining({ lastReminderStage: 'upcoming' }),
      }),
    );
  });

  it('sends a MILESTONE_VERLOPEN when the dueDate is in the past', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ dueDate: new Date('2026-06-25') }), // verleden → overdue
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch.mock.calls[0][0].type).toBe(
      NotificationType.MILESTONE_VERLOPEN,
    );
  });

  it('does not fire for a milestone still outside its reminder window', async () => {
    // dueDate 30 dagen weg, reminder 7 dagen → nog niet binnen het venster.
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ dueDate: new Date('2026-08-01'), reminderDaysBefore: 7 }),
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
  });

  it('fires exactly at the reminder-window boundary', async () => {
    // dueDate = now + 7 dagen, reminderDaysBefore = 7 → precies op de grens.
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ dueDate: new Date('2026-07-09T06:00:00.000Z'), reminderDaysBefore: 7 }),
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch.mock.calls[0][0].type).toBe(
      NotificationType.MILESTONE_HERINNERING,
    );
  });

  it('dedupes: a second run for the same stage sends nothing', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ lastReminderStage: 'upcoming' }), // stage al verstuurd
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    expect(mockPrisma.phaseMilestone.update).not.toHaveBeenCalled();
  });

  it('stage transition: an already-"upcoming" milestone re-fires once it becomes overdue', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ dueDate: new Date('2026-06-25'), lastReminderStage: 'upcoming' }),
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(1);
    expect(mockNotifications.dispatch.mock.calls[0][0].type).toBe(
      NotificationType.MILESTONE_VERLOPEN,
    );
    expect(mockPrisma.phaseMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastReminderStage: 'overdue' }),
      }),
    );
  });

  it('deduplicates recipients (assignee = PM = follower → single id)', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({
        assigneeId: 'same',
        phase: {
          id: 'phase-1',
          name: 'Verdieping Noord',
          followers: [{ userId: 'same' }, { userId: null }],
          project: { projectManagerId: 'same' },
        },
      }),
    ]);

    await scheduler.processDueMilestones(NOW);

    const arg = mockNotifications.dispatch.mock.calls[0][0];
    expect(arg.recipientUserIds).toEqual(['same']);
  });

  it('marks as handled but sends nothing when there are no recipients', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({
        assigneeId: null,
        phase: {
          id: 'phase-1',
          name: 'Verdieping Noord',
          followers: [],
          project: { projectManagerId: null },
        },
      }),
    ]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    expect(mockPrisma.phaseMilestone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastReminderStage: 'upcoming' }),
      }),
    );
  });

  it('skips milestones for orgs without the PROJECT_FASEN feature (§Fase E)', async () => {
    // Org zit in een plan zonder PROJECT_FASEN → geen reminder, geen markering.
    mockEntitlements.getEnabledFeatures.mockResolvedValue(['BASIS_UITVOERING']);
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([milestone()]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    expect(mockPrisma.phaseMilestone.update).not.toHaveBeenCalled();
    // De entitlement-lookup gebeurt per unieke org (batched), niet per milestone.
    expect(mockEntitlements.getEnabledFeatures).toHaveBeenCalledTimes(1);
    expect(mockEntitlements.getEnabledFeatures).toHaveBeenCalledWith('org-1');
  });

  it('batches the entitlement lookup once per org across many milestones (§Fase E)', async () => {
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([
      milestone({ id: 'm-1', orgId: 'org-1' }),
      milestone({ id: 'm-2', orgId: 'org-1' }),
      milestone({ id: 'm-3', orgId: 'org-2' }),
    ]);

    await scheduler.processDueMilestones(NOW);

    // 3 milestones, 2 unieke orgs → 2 lookups, niet 3.
    expect(mockEntitlements.getEnabledFeatures).toHaveBeenCalledTimes(2);
  });

  it('skips milestones on non-active projects (filtered out by the query)', async () => {
    // De query filtert al op ACTIEF project; hier komt dus niets terug.
    mockPrisma.phaseMilestone.findMany.mockResolvedValue([]);

    const sent = await scheduler.processDueMilestones(NOW);

    expect(sent).toBe(0);
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    // Bevestig dat de where-clause op een niet-verwijderde fase + ACTIEF project filtert.
    const where = mockPrisma.phaseMilestone.findMany.mock.calls[0][0].where;
    expect(where.phase.isDeleted).toBe(false);
    expect(where.phase.project.status).toBe('ACTIEF');
  });
});
