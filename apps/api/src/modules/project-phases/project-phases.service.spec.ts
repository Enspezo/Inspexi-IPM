import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, PhaseStatus, MilestoneStatus, NotificationType } from '@prisma/client';
import { ProjectPhasesService } from './project-phases.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';

describe('ProjectPhasesService', () => {
  let service: ProjectPhasesService;

  const mockPrisma: any = {
    project: { findUnique: jest.fn() },
    projectPhase: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    projectFollower: { findMany: jest.fn() },
    projectPhaseFollower: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createMany: jest.fn(),
    },
    phaseMilestone: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    location: { findUnique: jest.fn() },
    contactPerson: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    inspectionPlan: { count: jest.fn() },
    planningItem: { count: jest.fn() },
    workOrder: { count: jest.fn() },
    quote: { count: jest.fn() },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
  };

  const mockNotifications = { dispatch: jest.fn() };
  const mockEmail = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) };

  const admin = { id: 'user-1', orgId: 'org-1', roles: [Role.ORG_ADMIN] } as any;
  const inspecteur = { id: 'user-2', orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  const project = { id: 'project-1', orgId: 'org-1', isDeleted: false };
  const phaseRow = (over: any = {}) => ({
    id: 'phase-1',
    orgId: 'org-1',
    projectId: 'project-1',
    name: 'Fase 1',
    status: PhaseStatus.NIET_GESTART,
    sortOrder: 0,
    isDeleted: false,
    budgetAmount: 1000,
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPhasesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();
    service = module.get(ProjectPhasesService);
    mockPrisma.project.findUnique.mockResolvedValue(project);
    mockPrisma.projectPhaseFollower.findMany.mockResolvedValue([]);
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: 'Org', senderName: null, senderEmail: null,
    });
  });

  // ─── create ───────────────────────────────────────────────

  it('create: sets sortOrder=max+1, copies project followers, returns detail', async () => {
    mockPrisma.projectPhase.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    mockPrisma.projectFollower.findMany.mockResolvedValue([
      { userId: 'u9', email: null, name: 'Volger', canViewGeneral: true, canViewRequests: false, canViewQuotes: true, canViewPlanning: true, canViewDocuments: false },
    ]);
    mockPrisma.projectPhase.create.mockResolvedValue(phaseRow({ id: 'phase-new', sortOrder: 3 }));
    // findOne after create
    mockPrisma.projectPhase.findUnique.mockResolvedValue(
      phaseRow({ id: 'phase-new', sortOrder: 3, milestones: [], followers: [], _count: {} }),
    );

    await service.create('project-1', { name: 'Fase 3' }, admin);

    expect(mockPrisma.projectPhase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3, projectId: 'project-1', orgId: 'org-1' }) }),
    );
    expect(mockPrisma.projectPhaseFollower.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ phaseId: 'phase-new', userId: 'u9' })] }),
    );
  });

  it('create: sortOrder=0 for the first phase of a project', async () => {
    mockPrisma.projectPhase.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockPrisma.projectFollower.findMany.mockResolvedValue([]);
    mockPrisma.projectPhase.create.mockResolvedValue(phaseRow({ id: 'phase-new' }));
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow({ id: 'phase-new', milestones: [], followers: [], _count: {} }));

    await service.create('project-1', { name: 'Fase 1' }, admin);

    expect(mockPrisma.projectPhase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
    );
    expect(mockPrisma.projectPhaseFollower.createMany).not.toHaveBeenCalled();
  });

  it('create: sets completedAt when created directly as AFGEROND', async () => {
    mockPrisma.projectPhase.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockPrisma.projectFollower.findMany.mockResolvedValue([]);
    mockPrisma.projectPhase.create.mockResolvedValue(phaseRow({ id: 'p' }));
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow({ id: 'p', milestones: [], followers: [], _count: {} }));

    await service.create('project-1', { name: 'X', status: PhaseStatus.AFGEROND }, admin);

    const data = mockPrisma.projectPhase.create.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('create: rejects a cross-tenant locationId', async () => {
    mockPrisma.location.findUnique.mockResolvedValue({ orgId: 'org-2' });
    await expect(
      service.create('project-1', { name: 'X', locationId: 'loc-x' }, admin),
    ).rejects.toThrow();
  });

  // ─── budget stripping ─────────────────────────────────────

  it('findAll: strips budgetAmount for INSPECTEUR but keeps it for staff (§12.4.8)', async () => {
    mockPrisma.projectPhase.findMany.mockResolvedValue([phaseRow({ budgetAmount: 1000 })]);

    const asStaff = await service.findAll('project-1', admin);
    expect(asStaff[0]).toHaveProperty('budgetAmount');

    const asInspecteur = await service.findAll('project-1', inspecteur);
    expect(asInspecteur[0]).not.toHaveProperty('budgetAmount');
  });

  // ─── update / completedAt ─────────────────────────────────

  it('update: sets completedAt when moving to AFGEROND (§12.4.5)', async () => {
    mockPrisma.projectPhase.findUnique
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.ACTIEF })) // requirePhase
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.AFGEROND, milestones: [], followers: [], _count: {} })); // findOne
    mockPrisma.projectPhase.update.mockResolvedValue(phaseRow());

    await service.update('project-1', 'phase-1', { status: PhaseStatus.AFGEROND }, admin);

    const data = mockPrisma.projectPhase.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('update: clears completedAt when moving away from AFGEROND (§12.4.5)', async () => {
    mockPrisma.projectPhase.findUnique
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.AFGEROND }))
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.ACTIEF, milestones: [], followers: [], _count: {} }));
    mockPrisma.projectPhase.update.mockResolvedValue(phaseRow());

    await service.update('project-1', 'phase-1', { status: PhaseStatus.ACTIEF }, admin);

    const data = mockPrisma.projectPhase.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
  });

  it('update: dispatches FASE_STATUS_GEWIJZIGD to PM + internal followers (actor excluded) and e-mails externals', async () => {
    mockPrisma.projectPhase.findUnique
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.NIET_GESTART })) // requirePhase
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.ACTIEF, milestones: [], followers: [], _count: {} })); // findOne
    mockPrisma.projectPhase.update.mockResolvedValue(
      phaseRow({ status: PhaseStatus.ACTIEF }),
    );
    mockPrisma.project.findUnique.mockResolvedValue({
      ...project,
      projectManagerId: 'pm-1',
      title: 'Zuidas',
    });
    mockPrisma.projectPhaseFollower.findMany.mockResolvedValue([
      { userId: 'follower-1', email: null },
      { userId: 'user-1', email: null }, // = actor → excluded
      { userId: null, email: 'ext@example.com' }, // external → email only
    ]);

    await service.update('project-1', 'phase-1', { status: PhaseStatus.ACTIEF }, admin);
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget email settle

    expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
    const arg = mockNotifications.dispatch.mock.calls[0][0];
    expect(arg.type).toBe(NotificationType.FASE_STATUS_GEWIJZIGD);
    expect(arg.entityType).toBe('projectPhase');
    expect(arg.entityId).toBe('phase-1');
    expect(arg.recipientUserIds).toEqual(expect.arrayContaining(['pm-1', 'follower-1']));
    expect(arg.recipientUserIds).not.toContain('user-1');
    expect(mockEmail.sendNotificationEmail).toHaveBeenCalledWith(
      'ext@example.com',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ orgId: 'org-1' }),
    );
  });

  it('update: does not dispatch when status is unchanged', async () => {
    mockPrisma.projectPhase.findUnique
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.ACTIEF }))
      .mockResolvedValueOnce(phaseRow({ status: PhaseStatus.ACTIEF, milestones: [], followers: [], _count: {} }));
    mockPrisma.projectPhase.update.mockResolvedValue(phaseRow({ status: PhaseStatus.ACTIEF }));

    await service.update('project-1', 'phase-1', { name: 'Nieuwe naam' }, admin);

    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
  });

  // ─── reorder ──────────────────────────────────────────────

  it('reorder: rewrites sortOrder for the exact set of phases', async () => {
    mockPrisma.projectPhase.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) // reorder validation
      .mockResolvedValueOnce([]); // findAll return
    mockPrisma.projectPhase.update.mockResolvedValue({});

    await service.reorder('project-1', { orderedIds: ['c', 'a', 'b'] }, admin);

    expect(mockPrisma.projectPhase.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { sortOrder: 0 } });
    expect(mockPrisma.projectPhase.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sortOrder: 1 } });
    expect(mockPrisma.projectPhase.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sortOrder: 2 } });
  });

  it('reorder: rejects a set that is not exactly the project phases', async () => {
    mockPrisma.projectPhase.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await expect(
      service.reorder('project-1', { orderedIds: ['a', 'x'] }, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('reorder: rejects a partial set (missing an id)', async () => {
    mockPrisma.projectPhase.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await expect(
      service.reorder('project-1', { orderedIds: ['a', 'b'] }, admin),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── delete blockade ──────────────────────────────────────

  it('remove: blocks soft-delete while entities are linked, with counts (§12.4.7)', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.inspectionPlan.count.mockResolvedValue(2);
    mockPrisma.planningItem.count.mockResolvedValue(0);
    mockPrisma.workOrder.count.mockResolvedValue(1);
    mockPrisma.quote.count.mockResolvedValue(0);

    await expect(service.remove('project-1', 'phase-1', admin)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.projectPhase.update).not.toHaveBeenCalled();
  });

  it('remove: soft-deletes and lapses open milestones when no links exist (§12.4.7)', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.inspectionPlan.count.mockResolvedValue(0);
    mockPrisma.planningItem.count.mockResolvedValue(0);
    mockPrisma.workOrder.count.mockResolvedValue(0);
    mockPrisma.quote.count.mockResolvedValue(0);
    mockPrisma.phaseMilestone.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.projectPhase.update.mockResolvedValue(phaseRow({ isDeleted: true }));

    await service.remove('project-1', 'phase-1', admin);

    expect(mockPrisma.phaseMilestone.updateMany).toHaveBeenCalledWith({
      where: { phaseId: 'phase-1', status: MilestoneStatus.OPEN },
      data: { status: MilestoneStatus.VERVALLEN },
    });
    expect(mockPrisma.projectPhase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDeleted: true }) }),
    );
  });

  // ─── followers snapshot / management ──────────────────────

  it('addFollower: rejects when neither userId nor email is given', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    await expect(service.addFollower('project-1', 'phase-1', {}, admin)).rejects.toThrow(BadRequestException);
  });

  // ─── milestones ───────────────────────────────────────────

  it('addMilestone: creates with defaults', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.phaseMilestone.create.mockResolvedValue({ id: 'm1' });

    await service.addMilestone('project-1', 'phase-1', { title: 'M', dueDate: '2026-08-01' }, admin);

    expect(mockPrisma.phaseMilestone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phaseId: 'phase-1', orgId: 'org-1', reminderDaysBefore: 7 }),
      }),
    );
  });

  it('updateMilestone: BEHAALD sets completedAt', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.phaseMilestone.findUnique.mockResolvedValue({ id: 'm1', phaseId: 'phase-1', status: MilestoneStatus.OPEN, dueDate: new Date('2026-08-01') });
    mockPrisma.phaseMilestone.update.mockResolvedValue({ id: 'm1' });

    await service.updateMilestone('project-1', 'phase-1', 'm1', { status: MilestoneStatus.BEHAALD }, admin);

    const data = mockPrisma.phaseMilestone.update.mock.calls[0][0].data;
    expect(data.status).toBe(MilestoneStatus.BEHAALD);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('updateMilestone: back to OPEN clears completedAt and resets reminder dedupe', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.phaseMilestone.findUnique.mockResolvedValue({ id: 'm1', phaseId: 'phase-1', status: MilestoneStatus.BEHAALD, dueDate: new Date('2026-08-01') });
    mockPrisma.phaseMilestone.update.mockResolvedValue({ id: 'm1' });

    await service.updateMilestone('project-1', 'phase-1', 'm1', { status: MilestoneStatus.OPEN }, admin);

    const data = mockPrisma.phaseMilestone.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
    expect(data.lastReminderStage).toBeNull();
    expect(data.lastReminderAt).toBeNull();
  });

  it('updateMilestone: changing dueDate resets reminder dedupe', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.phaseMilestone.findUnique.mockResolvedValue({ id: 'm1', phaseId: 'phase-1', status: MilestoneStatus.OPEN, dueDate: new Date('2026-08-01') });
    mockPrisma.phaseMilestone.update.mockResolvedValue({ id: 'm1' });

    await service.updateMilestone('project-1', 'phase-1', 'm1', { dueDate: '2026-09-01' }, admin);

    const data = mockPrisma.phaseMilestone.update.mock.calls[0][0].data;
    expect(data.lastReminderStage).toBeNull();
    expect(data.lastReminderAt).toBeNull();
  });

  it('updateMilestone: 404 when the milestone belongs to another phase', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow());
    mockPrisma.phaseMilestone.findUnique.mockResolvedValue({ id: 'm1', phaseId: 'other-phase' });
    await expect(
      service.updateMilestone('project-1', 'phase-1', 'm1', { title: 'X' }, admin),
    ).rejects.toThrow(NotFoundException);
  });

  it('requirePhase: 404 when the phase is not in the given project', async () => {
    mockPrisma.projectPhase.findUnique.mockResolvedValue(phaseRow({ projectId: 'other-project' }));
    await expect(service.findOne('project-1', 'phase-1', admin)).rejects.toThrow(NotFoundException);
  });
});
