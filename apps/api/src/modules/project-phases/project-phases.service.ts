import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  PhaseStatus,
  MilestoneStatus,
  NotificationType,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertFound, assertOrgAccess, assertSameOrg } from '@/common';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { PHASE_STATUS_LABELS } from './project-phases.constants';
import {
  CreateProjectPhaseDto,
  UpdateProjectPhaseDto,
  ReorderPhasesDto,
  AddPhaseFollowerDto,
  UpdatePhaseFollowerDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto';

const USER_SUMMARY = {
  select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true },
};

const PHASE_LIST_INCLUDE = {
  location: { select: { id: true, name: true, city: true } },
  contactPerson: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  milestones: { select: { id: true, status: true, dueDate: true } },
  _count: {
    select: {
      inspectionPlans: true,
      planningItems: true,
      workOrders: true,
      quotes: true,
      followers: true,
      milestones: true,
    },
  },
};

const PHASE_DETAIL_INCLUDE = {
  location: { select: { id: true, name: true, city: true } },
  contactPerson: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  followers: { include: { user: USER_SUMMARY }, orderBy: { createdAt: 'asc' as const } },
  milestones: {
    include: { assignee: USER_SUMMARY },
    orderBy: [{ sortOrder: 'asc' as const }, { dueDate: 'asc' as const }],
  },
  _count: {
    select: {
      inspectionPlans: true,
      planningItems: true,
      workOrders: true,
      quotes: true,
      followers: true,
      milestones: true,
    },
  },
};

@Injectable()
export class ProjectPhasesService {
  private readonly logger = new Logger(ProjectPhasesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────

  /** True when the user may see/edit `budgetAmount` (all staff except pure INSPECTEUR). */
  private canSeeBudget(user: User): boolean {
    return user.roles.some((r) => r !== Role.INSPECTEUR);
  }

  /** Strip `budgetAmount` from a phase (or array) for INSPECTEUR-only users (§12.4.8). */
  private stripBudget<T extends { budgetAmount?: unknown }>(entity: T, user: User): T {
    if (this.canSeeBudget(user)) return entity;
    const { budgetAmount: _omit, ...rest } = entity as Record<string, unknown>;
    return rest as T;
  }

  /** Fetch the parent project, asserting org access and that it is not deleted. */
  private async requireProject(projectId: string, user: User) {
    const project = assertFound(
      await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, orgId: true, isDeleted: true },
      }),
      'Project',
    );
    if (project.isDeleted) throw new NotFoundException('Project niet gevonden');
    assertOrgAccess(user, project.orgId);
    return project;
  }

  /** Fetch a non-deleted phase within the given project, asserting org access. */
  private async requirePhase(projectId: string, id: string, user: User) {
    const phase = await this.prisma.projectPhase.findUnique({ where: { id } });
    if (!phase || phase.isDeleted || phase.projectId !== projectId) {
      throw new NotFoundException('Fase niet gevonden');
    }
    assertOrgAccess(user, phase.orgId);
    return phase;
  }

  // ─── Phase CRUD ───────────────────────────────────────────

  async findAll(projectId: string, user: User) {
    await this.requireProject(projectId, user);
    const phases = await this.prisma.projectPhase.findMany({
      where: { projectId, isDeleted: false },
      include: PHASE_LIST_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
    return phases.map((p) => this.stripBudget(p, user));
  }

  async findOne(projectId: string, id: string, user: User) {
    await this.requireProject(projectId, user);
    const phase = await this.prisma.projectPhase.findUnique({
      where: { id },
      include: PHASE_DETAIL_INCLUDE,
    });
    if (!phase || phase.isDeleted || phase.projectId !== projectId) {
      throw new NotFoundException('Fase niet gevonden');
    }
    assertOrgAccess(user, phase.orgId);
    return this.stripBudget(phase, user);
  }

  async create(projectId: string, dto: CreateProjectPhaseDto, user: User) {
    const project = await this.requireProject(projectId, user);
    const orgId = project.orgId;

    // Cross-tenant guard on supplied FKs.
    await Promise.all([
      assertSameOrg(this.prisma.location, dto.locationId, orgId, 'Locatie'),
      assertSameOrg(this.prisma.contactPerson, dto.contactPersonId, orgId, 'Contactpersoon'),
    ]);

    // sortOrder = max+1 within the project.
    const max = await this.prisma.projectPhase.aggregate({
      where: { projectId, isDeleted: false },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    // Snapshot the project's followers as phase followers (§12.4.9).
    const projectFollowers = await this.prisma.projectFollower.findMany({
      where: { projectId },
    });

    const phase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectPhase.create({
        data: {
          orgId,
          projectId,
          name: dto.name,
          description: dto.description ?? null,
          status: dto.status ?? PhaseStatus.NIET_GESTART,
          sortOrder,
          locationId: dto.locationId ?? null,
          contactPersonId: dto.contactPersonId ?? null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : null,
          completedAt: dto.status === PhaseStatus.AFGEROND ? new Date() : null,
          budgetAmount: dto.budgetAmount ?? null,
          createdBy: user.id,
        },
      });

      if (projectFollowers.length) {
        await tx.projectPhaseFollower.createMany({
          data: projectFollowers.map((f) => ({
            phaseId: created.id,
            userId: f.userId,
            email: f.email,
            name: f.name,
            canViewGeneral: f.canViewGeneral,
            canViewRequests: f.canViewRequests,
            canViewQuotes: f.canViewQuotes,
            canViewPlanning: f.canViewPlanning,
            canViewDocuments: f.canViewDocuments,
          })),
        });
      }

      return created;
    });

    return this.findOne(projectId, phase.id, user);
  }

  async update(projectId: string, id: string, dto: UpdateProjectPhaseDto, user: User) {
    const existing = await this.requirePhase(projectId, id, user);
    const orgId = existing.orgId;

    await Promise.all([
      assertSameOrg(this.prisma.location, dto.locationId, orgId, 'Locatie'),
      assertSameOrg(this.prisma.contactPerson, dto.contactPersonId, orgId, 'Contactpersoon'),
    ]);

    const data: Prisma.ProjectPhaseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.expectedEndDate !== undefined)
      data.expectedEndDate = dto.expectedEndDate ? new Date(dto.expectedEndDate) : null;
    if (dto.locationId !== undefined)
      data.location = dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true };
    if (dto.contactPersonId !== undefined)
      data.contactPerson = dto.contactPersonId
        ? { connect: { id: dto.contactPersonId } }
        : { disconnect: true };
    // budgetAmount alleen door canWrite-rollen (INSPECTEUR kan hier sowieso niet komen).
    if (dto.budgetAmount !== undefined && this.canSeeBudget(user))
      data.budgetAmount = dto.budgetAmount ?? null;

    // completedAt automatisch bij wissel naar/van AFGEROND (§12.4.5).
    if (dto.status !== undefined && dto.status !== existing.status) {
      if (dto.status === PhaseStatus.AFGEROND) {
        data.completedAt = new Date();
      } else if (existing.status === PhaseStatus.AFGEROND) {
        data.completedAt = null;
      }
    }

    const updated = await this.prisma.projectPhase.update({ where: { id }, data });

    // Notificeer bij een daadwerkelijke statuswissel (§12.6.1, fire-and-forget).
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.notifyStatusChange(updated, existing.status, user.id).catch((err) =>
        this.logger.error(`Fase-statusnotificatie mislukt voor fase ${id}`, err),
      );
    }

    return this.findOne(projectId, id, user);
  }

  /**
   * Dispatch bij een statuswissel van een fase (§12.6.1):
   * - In-app/e-mail (via prefs) naar projectmanager + interne fasevolgers,
   *   de gebruiker die de wijziging deed uitgezonderd.
   * - Externe fasevolgers (alleen e-mail, geen userId) krijgen **uitsluitend**
   *   bij een statuswissel een directe e-mail (§12.12.2).
   */
  private async notifyStatusChange(
    phase: { id: string; orgId: string; projectId: string; name: string; status: PhaseStatus },
    oldStatus: PhaseStatus,
    actingUserId: string,
  ): Promise<void> {
    const statusLabel = PHASE_STATUS_LABELS[phase.status] ?? phase.status;
    const [project, followers, org] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: phase.projectId },
        select: { projectManagerId: true, title: true },
      }),
      this.prisma.projectPhaseFollower.findMany({
        where: { phaseId: phase.id },
        select: { userId: true, email: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: phase.orgId },
        select: { name: true, senderName: true, senderEmail: true },
      }),
    ]);

    const title = `Fasestatus gewijzigd: ${phase.name}`;
    const body = `Fase '${phase.name}'${
      project?.title ? ` (project ${project.title})` : ''
    } is nu ${statusLabel}.`;

    // Interne ontvangers: projectmanager + interne fasevolgers, actor uitgesloten.
    const internalIds = [
      ...(project?.projectManagerId ? [project.projectManagerId] : []),
      ...followers.map((f) => f.userId).filter((uid): uid is string => !!uid),
    ];
    const recipientUserIds = [...new Set(internalIds)].filter((uid) => uid !== actingUserId);

    this.notifications.dispatch({
      type: NotificationType.FASE_STATUS_GEWIJZIGD,
      orgId: phase.orgId,
      recipientUserIds,
      title,
      body,
      entityType: 'projectPhase',
      entityId: phase.id,
    });

    // Externe volgers: alleen e-mail, alleen bij statuswissel.
    const externalEmails = [
      ...new Set(followers.filter((f) => !f.userId && f.email).map((f) => f.email as string)),
    ];
    for (const email of externalEmails) {
      this.emailService
        .sendNotificationEmail(email, title, body, {
          senderName: org?.senderName,
          senderEmail: org?.senderEmail,
          orgId: phase.orgId,
          orgName: org?.name ?? undefined,
        })
        .catch((err) => this.logger.error(`Fase-status e-mail mislukt naar ${email}`, err));
    }
  }

  async reorder(projectId: string, dto: ReorderPhasesDto, user: User) {
    await this.requireProject(projectId, user);

    const phases = await this.prisma.projectPhase.findMany({
      where: { projectId, isDeleted: false },
      select: { id: true },
    });
    const existingIds = new Set(phases.map((p) => p.id));
    const orderedIds = dto.orderedIds;
    const orderedSet = new Set(orderedIds);

    // The ordered set must be exactly the non-deleted phases of the project.
    if (
      orderedIds.length !== existingIds.size ||
      orderedSet.size !== orderedIds.length ||
      orderedIds.some((pid) => !existingIds.has(pid))
    ) {
      throw new BadRequestException(
        'De volgorde moet exact alle niet-verwijderde fasen van dit project bevatten',
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((pid, index) =>
        this.prisma.projectPhase.update({
          where: { id: pid },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findAll(projectId, user);
  }

  async remove(projectId: string, id: string, user: User) {
    await this.requirePhase(projectId, id, user);

    // Block soft-delete while entities are still linked (§12.4.7).
    const [inspectionPlans, planningItems, workOrders, quotes] = await Promise.all([
      this.prisma.inspectionPlan.count({ where: { projectPhaseId: id } }),
      this.prisma.planningItem.count({ where: { projectPhaseId: id } }),
      this.prisma.workOrder.count({ where: { projectPhaseId: id } }),
      this.prisma.quote.count({ where: { projectPhaseId: id } }),
    ]);

    const total = inspectionPlans + planningItems + workOrders + quotes;
    if (total > 0) {
      const parts: string[] = [];
      if (inspectionPlans) parts.push(`${inspectionPlans} inspectieplan(nen)`);
      if (planningItems) parts.push(`${planningItems} planregel(s)`);
      if (workOrders) parts.push(`${workOrders} werkbon(nen)`);
      if (quotes) parts.push(`${quotes} offerte(s)`);
      throw new BadRequestException(
        `Fase kan niet verwijderd worden: ontkoppel eerst ${parts.join(', ')}.`,
      );
    }

    await this.prisma.$transaction([
      // Open milestones vervallen bij het verwijderen van de fase (§12.4.7).
      this.prisma.phaseMilestone.updateMany({
        where: { phaseId: id, status: MilestoneStatus.OPEN },
        data: { status: MilestoneStatus.VERVALLEN },
      }),
      this.prisma.projectPhase.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  // ─── Followers ────────────────────────────────────────────

  async getFollowers(projectId: string, id: string, user: User) {
    await this.requirePhase(projectId, id, user);
    return this.prisma.projectPhaseFollower.findMany({
      where: { phaseId: id },
      include: { user: USER_SUMMARY },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addFollower(projectId: string, id: string, dto: AddPhaseFollowerDto, user: User) {
    const phase = await this.requirePhase(projectId, id, user);

    if (!dto.userId && !dto.email) {
      throw new BadRequestException('Geef een gebruiker ID of een e-mailadres op');
    }
    if (dto.userId) {
      await assertSameOrg(this.prisma.user, dto.userId, phase.orgId, 'Gebruiker');
      const exists = await this.prisma.projectPhaseFollower.findFirst({
        where: { phaseId: id, userId: dto.userId },
      });
      if (exists) throw new BadRequestException('Deze gebruiker is al een volger');
    } else {
      const exists = await this.prisma.projectPhaseFollower.findFirst({
        where: { phaseId: id, email: dto.email },
      });
      if (exists) throw new BadRequestException('Dit e-mailadres is al een volger');
    }

    const isInternal = !!dto.userId;
    return this.prisma.projectPhaseFollower.create({
      data: {
        phaseId: id,
        userId: dto.userId ?? null,
        email: dto.userId ? null : (dto.email ?? null),
        name: dto.name ?? null,
        canViewGeneral: isInternal ? true : (dto.canViewGeneral ?? true),
        canViewRequests: isInternal ? true : (dto.canViewRequests ?? false),
        canViewQuotes: isInternal ? true : (dto.canViewQuotes ?? true),
        canViewPlanning: isInternal ? true : (dto.canViewPlanning ?? true),
        canViewDocuments: isInternal ? true : (dto.canViewDocuments ?? false),
      },
      include: { user: USER_SUMMARY },
    });
  }

  async updateFollower(
    projectId: string,
    id: string,
    followerId: string,
    dto: UpdatePhaseFollowerDto,
    user: User,
  ) {
    await this.requirePhase(projectId, id, user);
    const follower = await this.prisma.projectPhaseFollower.findUnique({
      where: { id: followerId },
    });
    if (!follower || follower.phaseId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    return this.prisma.projectPhaseFollower.update({
      where: { id: followerId },
      data: {
        ...(dto.canViewGeneral !== undefined && { canViewGeneral: dto.canViewGeneral }),
        ...(dto.canViewRequests !== undefined && { canViewRequests: dto.canViewRequests }),
        ...(dto.canViewQuotes !== undefined && { canViewQuotes: dto.canViewQuotes }),
        ...(dto.canViewPlanning !== undefined && { canViewPlanning: dto.canViewPlanning }),
        ...(dto.canViewDocuments !== undefined && { canViewDocuments: dto.canViewDocuments }),
      },
      include: { user: USER_SUMMARY },
    });
  }

  async removeFollower(projectId: string, id: string, followerId: string, user: User) {
    await this.requirePhase(projectId, id, user);
    const follower = await this.prisma.projectPhaseFollower.findUnique({
      where: { id: followerId },
    });
    if (!follower || follower.phaseId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    await this.prisma.projectPhaseFollower.delete({ where: { id: followerId } });
    return { success: true };
  }

  // ─── Milestones ───────────────────────────────────────────

  async getMilestones(projectId: string, id: string, user: User) {
    await this.requirePhase(projectId, id, user);
    return this.prisma.phaseMilestone.findMany({
      where: { phaseId: id },
      include: { assignee: USER_SUMMARY },
      orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async addMilestone(projectId: string, id: string, dto: CreateMilestoneDto, user: User) {
    const phase = await this.requirePhase(projectId, id, user);
    await assertSameOrg(this.prisma.user, dto.assigneeId, phase.orgId, 'Verantwoordelijke');

    return this.prisma.phaseMilestone.create({
      data: {
        orgId: phase.orgId,
        phaseId: id,
        title: dto.title,
        description: dto.description ?? null,
        dueDate: new Date(dto.dueDate),
        assigneeId: dto.assigneeId ?? null,
        reminderDaysBefore: dto.reminderDaysBefore ?? 7,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { assignee: USER_SUMMARY },
    });
  }

  async updateMilestone(
    projectId: string,
    id: string,
    milestoneId: string,
    dto: UpdateMilestoneDto,
    user: User,
  ) {
    const phase = await this.requirePhase(projectId, id, user);
    const milestone = await this.prisma.phaseMilestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.phaseId !== id) {
      throw new NotFoundException('Milestone niet gevonden');
    }
    await assertSameOrg(this.prisma.user, dto.assigneeId, phase.orgId, 'Verantwoordelijke');

    const data: Prisma.PhaseMilestoneUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.reminderDaysBefore !== undefined) data.reminderDaysBefore = dto.reminderDaysBefore;
    if (dto.assigneeId !== undefined)
      data.assignee = dto.assigneeId ? { connect: { id: dto.assigneeId } } : { disconnect: true };

    // dueDate-wijziging → reminder-dedupe resetten (§12.6.2 / Fase C).
    const dueChanged =
      dto.dueDate !== undefined &&
      new Date(dto.dueDate).getTime() !== milestone.dueDate.getTime();
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dueChanged) {
      data.lastReminderStage = null;
      data.lastReminderAt = null;
    }

    // Status-overgangen: completedAt afleiden + reminder resetten bij terug naar OPEN.
    if (dto.status !== undefined && dto.status !== milestone.status) {
      data.status = dto.status;
      if (dto.status === MilestoneStatus.BEHAALD) {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
      if (dto.status === MilestoneStatus.OPEN) {
        data.lastReminderStage = null;
        data.lastReminderAt = null;
      }
    }

    return this.prisma.phaseMilestone.update({
      where: { id: milestoneId },
      data,
      include: { assignee: USER_SUMMARY },
    });
  }

  async removeMilestone(projectId: string, id: string, milestoneId: string, user: User) {
    await this.requirePhase(projectId, id, user);
    const milestone = await this.prisma.phaseMilestone.findUnique({ where: { id: milestoneId } });
    if (!milestone || milestone.phaseId !== id) {
      throw new NotFoundException('Milestone niet gevonden');
    }
    await this.prisma.phaseMilestone.delete({ where: { id: milestoneId } });
    return { success: true };
  }
}
