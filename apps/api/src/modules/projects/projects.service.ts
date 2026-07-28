import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, buildOrderBy, orgScope, assertFound, assertSameOrg, assertOrgAccess } from '@/common';
import { NumberingService } from '@/modules/numbering/numbering.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsQueryDto,
  AddProjectFollowerDto,
  UpdateProjectFollowerDto,
  AssignToProjectDto,
} from './dto';
import type { User } from '@prisma/client';

const PROJECT_INCLUDE = {
  contact: {
    select: { id: true, type: true, companyName: true, firstName: true, lastName: true, email: true },
  },
  location: {
    select: { id: true, name: true, city: true },
  },
  projectManager: {
    select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true },
  },
  createdByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  _count: {
    select: { requests: { where: { isDeleted: false } }, quotes: true, planningItems: true },
  },
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private numbering: NumberingService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────

  /** Build numbering placeholder context (contact name + location postcode) for a project. */
  private async numberingContext(contactId: string, locationId?: string | null) {
    const [contact, location] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { companyName: true, firstName: true, lastName: true },
      }),
      locationId
        ? this.prisma.location.findUnique({
            where: { id: locationId },
            select: { postalCode: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      contact: contact
        ? contact.companyName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(' ')
        : undefined,
      postcode: location?.postalCode,
    };
  }

  // ─── CRUD ─────────────────────────────────────────────────

  async findAll(user: User, query: ListProjectsQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 25), 100);
    const { sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['projectNumber', 'title', 'status', 'startDate', 'expectedEndDate', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { createdAt: 'desc' });

    const where: any = { ...orgScope(user), isDeleted: false };
    if (query.status) where.status = query.status;
    if (query.contactId) where.contactId = query.contactId;
    if (query.projectManagerId) where.projectManagerId = query.projectManagerId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { projectNumber: { contains: query.search, mode: 'insensitive' } },
        { contact: { companyName: { contains: query.search, mode: 'insensitive' } } },
        { contact: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { contact: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return paginate(this.prisma.project, {
      where,
      include: PROJECT_INCLUDE,
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: PROJECT_INCLUDE,
    });
    if (!project || project.isDeleted) throw new NotFoundException('Project niet gevonden');
    assertOrgAccess(user, project.orgId, 'Project');
    return project;
  }

  async create(dto: CreateProjectDto, user: User) {
    const orgId = user.orgId!;

    // Cross-tenant guard: every supplied FK must belong to the caller's org so a
    // tenant cannot link a project to (or hijack) another tenant's records.
    await Promise.all([
      assertSameOrg(this.prisma.contact, dto.contactId, orgId, 'Relatie'),
      assertSameOrg(this.prisma.location, dto.locationId, orgId, 'Locatie'),
      assertSameOrg(this.prisma.user, dto.projectManagerId, orgId, 'Projectmanager'),
      assertSameOrg(this.prisma.request, dto.requestId, orgId, 'Aanvraag'),
      assertSameOrg(this.prisma.quote, dto.quoteId, orgId, 'Offerte'),
    ]);

    return this.numbering.runWithGeneratedNumber(
      'PROJECT',
      orgId,
      {
        manual: dto.projectNumber,
        loadContext: () => this.numberingContext(dto.contactId, dto.locationId),
      },
      async (tx, projectNumber) => {
      const project = await tx.project.create({
        data: {
          orgId,
          projectNumber,
          title: dto.title,
          description: dto.description,
          contactId: dto.contactId,
          locationId: dto.locationId ?? null,
          projectManagerId: dto.projectManagerId ?? user.id,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          expectedEndDate: dto.expectedEndDate ? new Date(dto.expectedEndDate) : null,
          createdBy: user.id,
        },
        include: PROJECT_INCLUDE,
      });

      // Optionally link request/quote at creation. Scoped by orgId (validated
      // above) so the write can never reach another tenant's row.
      if (dto.requestId) {
        await tx.request.updateMany({
          where: { id: dto.requestId, orgId },
          data: { projectId: project.id },
        });
      }
      if (dto.quoteId) {
        await tx.quote.updateMany({
          where: { id: dto.quoteId, orgId },
          data: { projectId: project.id },
        });
      }

      // Cascade projectId to child entities
      await this.cascadeProjectIdDown(project.id, tx);

      // Notification (fire-and-forget)
      this.notifications.dispatch({
        type: 'PROJECT_AANGEMAAKT' as any,
        orgId,
        recipientUserIds: [project.projectManagerId],
        title: 'Nieuw project aangemaakt',
        body: `Project ${projectNumber} is aangemaakt.`,
        entityType: 'project',
        entityId: project.id,
      });

      return project;
      },
    );
  }

  async update(id: string, dto: UpdateProjectDto, user: User) {
    const existing = await this.findOne(id, user);
    const oldStatus = existing.status;

    // Cross-tenant guard on re-pointed FKs.
    await Promise.all([
      assertSameOrg(this.prisma.contact, dto.contactId, user.orgId, 'Relatie'),
      assertSameOrg(this.prisma.location, dto.locationId, user.orgId, 'Locatie'),
      assertSameOrg(this.prisma.user, dto.projectManagerId, user.orgId, 'Projectmanager'),
    ]);

    const data: any = {};
    if (dto.projectNumber !== undefined && dto.projectNumber.trim() !== existing.projectNumber) {
      data.projectNumber = await this.numbering.validateManualNumber(
        existing.orgId, 'PROJECT', dto.projectNumber, existing.id,
      );
    }
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.contactId !== undefined) data.contactId = dto.contactId;
    if (dto.locationId !== undefined) data.locationId = dto.locationId;
    if (dto.projectManagerId !== undefined) data.projectManagerId = dto.projectManagerId;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.expectedEndDate !== undefined) data.expectedEndDate = dto.expectedEndDate ? new Date(dto.expectedEndDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;

    // Auto-set endDate when marking as AFGEROND
    if (dto.status === ProjectStatus.AFGEROND && !dto.endDate) {
      data.endDate = new Date();
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data,
      include: PROJECT_INCLUDE,
    });

    // Notify on status change
    if (dto.status && dto.status !== oldStatus) {
      const followerUserIds = await this.getInternalFollowerUserIds(id);
      const recipientIds = [...new Set([existing.projectManagerId, ...followerUserIds])];
      this.notifications.dispatch({
        type: 'PROJECT_STATUS_GEWIJZIGD' as any,
        orgId: existing.orgId,
        recipientUserIds: recipientIds.filter((rid) => rid !== user.id),
        title: 'Projectstatus gewijzigd',
        body: `Project ${existing.projectNumber} is gewijzigd naar ${dto.status}.`,
        entityType: 'project',
        entityId: id,
      });
    }

    return updated;
  }

  async remove(id: string, user: User) {
    await this.findOne(id, user);
    await this.prisma.project.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  // ─── Entity linking ───────────────────────────────────────

  async assignEntities(id: string, dto: AssignToProjectDto, user: User) {
    const project = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx) => {
      if (dto.requestIds?.length) {
        await tx.request.updateMany({
          where: { id: { in: dto.requestIds }, orgId: project.orgId },
          data: { projectId: id },
        });
      }
      if (dto.quoteIds?.length) {
        await tx.quote.updateMany({
          where: { id: { in: dto.quoteIds }, orgId: project.orgId },
          data: { projectId: id },
        });
      }
      if (dto.planningItemIds?.length) {
        await tx.planningItem.updateMany({
          where: { id: { in: dto.planningItemIds }, orgId: project.orgId },
          data: { projectId: id },
        });
      }
      await this.cascadeProjectIdDown(id, tx);
    });

    return this.findOne(id, user);
  }

  async unassignEntities(id: string, dto: AssignToProjectDto, user: User) {
    await this.findOne(id, user);

    if (dto.requestIds?.length) {
      await this.prisma.request.updateMany({
        where: { id: { in: dto.requestIds }, projectId: id },
        data: { projectId: null },
      });
    }
    if (dto.quoteIds?.length) {
      await this.prisma.quote.updateMany({
        where: { id: { in: dto.quoteIds }, projectId: id },
        data: { projectId: null },
      });
    }
    if (dto.planningItemIds?.length) {
      await this.prisma.planningItem.updateMany({
        where: { id: { in: dto.planningItemIds }, projectId: id },
        data: { projectId: null },
      });
    }

    return this.findOne(id, user);
  }

  async getLinkedRequests(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.request.findMany({
      where: { projectId: id, isDeleted: false },
      include: {
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLinkedQuotes(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.quote.findMany({
      where: { projectId: id },
      include: {
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLinkedPlanning(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.planningItem.findMany({
      where: { projectId: id, isCancelled: false },
      include: {
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        location: { select: { id: true, name: true, city: true } },
        inspectors: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLinkedLocations(id: string, user: User) {
    await this.findOne(id, user);

    const locationSelect = {
      select: { id: true, name: true, street: true, houseNumber: true, postalCode: true, city: true },
    };

    const [requestLocs, quoteLocs, planningLocs] = await Promise.all([
      this.prisma.request.findMany({
        where: { projectId: id, isDeleted: false, locationId: { not: null } },
        select: { location: locationSelect },
      }),
      this.prisma.quote.findMany({
        where: { projectId: id, locationId: { not: null } },
        select: { location: locationSelect },
      }),
      this.prisma.planningItem.findMany({
        where: { projectId: id, isCancelled: false, locationId: { not: null } },
        select: { location: locationSelect },
      }),
    ]);

    const locationMap = new Map<string, { id: string; name: string; street: string; houseNumber: string; postalCode: string; city: string }>();
    for (const item of [...requestLocs, ...quoteLocs, ...planningLocs]) {
      if (item.location) locationMap.set(item.location.id, item.location);
    }

    return Array.from(locationMap.values());
  }

  // ─── Followers ────────────────────────────────────────────

  async getFollowers(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.projectFollower.findMany({
      where: { projectId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addFollower(id: string, dto: AddProjectFollowerDto, user: User) {
    await this.findOne(id, user);

    if (!dto.userId && !dto.email) {
      throw new BadRequestException('Geef een gebruiker ID of een e-mailadres op');
    }

    if (dto.userId) {
      // Prevent enrolling a foreign-org user (whose email would leak back via the
      // `user` include and who would then receive this org's notifications).
      await assertSameOrg(this.prisma.user, dto.userId, user.orgId, 'Gebruiker');
      const exists = await this.prisma.projectFollower.findFirst({
        where: { projectId: id, userId: dto.userId },
      });
      if (exists) throw new BadRequestException('Deze gebruiker is al een volger');
    } else {
      const exists = await this.prisma.projectFollower.findFirst({
        where: { projectId: id, email: dto.email },
      });
      if (exists) throw new BadRequestException('Dit e-mailadres is al een volger');
    }

    // Internal users get all permissions; external use provided or defaults
    const isInternal = !!dto.userId;
    return this.prisma.projectFollower.create({
      data: {
        projectId: id,
        userId: dto.userId ?? null,
        email: dto.userId ? null : (dto.email ?? null),
        name: dto.name ?? null,
        canViewGeneral: isInternal ? true : (dto.canViewGeneral ?? true),
        canViewRequests: isInternal ? true : (dto.canViewRequests ?? false),
        canViewQuotes: isInternal ? true : (dto.canViewQuotes ?? true),
        canViewPlanning: isInternal ? true : (dto.canViewPlanning ?? true),
        canViewDocuments: isInternal ? true : (dto.canViewDocuments ?? false),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } } },
    });
  }

  async removeFollower(id: string, followerId: string, user: User) {
    await this.findOne(id, user);
    const follower = await this.prisma.projectFollower.findUnique({
      where: { id: followerId },
    });
    if (!follower || follower.projectId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    await this.prisma.projectFollower.delete({ where: { id: followerId } });
  }

  async updateFollower(id: string, followerId: string, dto: UpdateProjectFollowerDto, user: User) {
    await this.findOne(id, user);
    const follower = await this.prisma.projectFollower.findUnique({
      where: { id: followerId },
    });
    if (!follower || follower.projectId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    return this.prisma.projectFollower.update({
      where: { id: followerId },
      data: {
        ...(dto.canViewGeneral !== undefined && { canViewGeneral: dto.canViewGeneral }),
        ...(dto.canViewRequests !== undefined && { canViewRequests: dto.canViewRequests }),
        ...(dto.canViewQuotes !== undefined && { canViewQuotes: dto.canViewQuotes }),
        ...(dto.canViewPlanning !== undefined && { canViewPlanning: dto.canViewPlanning }),
        ...(dto.canViewDocuments !== undefined && { canViewDocuments: dto.canViewDocuments }),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } } },
    });
  }

  // ─── Auto-creation from quote acceptance ──────────────────

  async createFromQuote(quote: {
    id: string;
    orgId: string;
    contactId: string;
    locationId: string | null;
    createdBy: string;
    quoteNumber: string;
    requestId: string | null;
  }): Promise<string | null> {
    // Check if quote already belongs to a project
    const existingQuote = await this.prisma.quote.findUnique({
      where: { id: quote.id },
      select: { projectId: true },
    });
    if (existingQuote?.projectId) return existingQuote.projectId;

    // Check if linked request already belongs to a project
    if (quote.requestId) {
      const existingRequest = await this.prisma.request.findUnique({
        where: { id: quote.requestId },
        select: { projectId: true },
      });
      if (existingRequest?.projectId) {
        // Link quote to existing project
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { projectId: existingRequest.projectId },
        });
        return existingRequest.projectId;
      }
    }

    // Get contact name for title
    const contact = await this.prisma.contact.findUnique({
      where: { id: quote.contactId },
      select: { companyName: true, firstName: true, lastName: true },
    });
    const contactName = contact?.companyName ||
      `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim() ||
      'Klant';

    return this.numbering.runWithGeneratedNumber(
      'PROJECT',
      quote.orgId,
      { loadContext: () => this.numberingContext(quote.contactId, quote.locationId) },
      async (tx, projectNumber) => {
      const project = await tx.project.create({
        data: {
          orgId: quote.orgId,
          projectNumber,
          title: `${contactName} - ${quote.quoteNumber}`,
          contactId: quote.contactId,
          locationId: quote.locationId,
          projectManagerId: quote.createdBy,
          createdBy: quote.createdBy,
        },
      });

      // Link quote to project
      await tx.quote.update({
        where: { id: quote.id },
        data: { projectId: project.id },
      });

      // Link request to project if applicable
      if (quote.requestId) {
        await tx.request.update({
          where: { id: quote.requestId },
          data: { projectId: project.id },
        });
      }

      this.logger.log(`Project ${projectNumber} auto-created for quote ${quote.quoteNumber}`);
      return project.id;
      },
    );
  }

  // ─── Auto-creation from request ───────────────────────────

  async createFromRequest(requestId: string, user: User) {
    const request = assertFound(
      await this.prisma.request.findUnique({
        where: { id: requestId },
        include: {
          contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        },
      }),
      'Aanvraag',
    );
    assertOrgAccess(user, request.orgId, 'Aanvraag');
    if (request.projectId) throw new BadRequestException('Aanvraag is al gekoppeld aan een project');

    const contactName = request.contact?.companyName ||
      `${request.contact?.firstName ?? ''} ${request.contact?.lastName ?? ''}`.trim() ||
      'Klant';

    return this.numbering.runWithGeneratedNumber(
      'PROJECT',
      request.orgId,
      { loadContext: () => this.numberingContext(request.contactId, request.locationId) },
      async (tx, projectNumber) => {
      const project = await tx.project.create({
        data: {
          orgId: request.orgId,
          projectNumber,
          title: `${contactName} - ${request.title}`,
          contactId: request.contactId,
          locationId: request.locationId,
          projectManagerId: request.assignedTo ?? request.createdBy,
          createdBy: user.id,
        },
        include: PROJECT_INCLUDE,
      });

      // Link request to project
      await tx.request.update({
        where: { id: requestId },
        data: { projectId: project.id },
      });

      // Cascade to linked quotes
      await this.cascadeProjectIdDown(project.id, tx);

      return project;
      },
    );
  }

  // ─── Follower cascade to planning ─────────────────────────

  async cascadeFollowersToPlanning(projectId: string, planningItemId: string): Promise<void> {
    const followers = await this.prisma.projectFollower.findMany({
      where: { projectId },
    });
    if (!followers.length) return;

    for (const f of followers) {
      // Check for duplicate
      const existing = f.userId
        ? await this.prisma.planningFollower.findFirst({
            where: { planningItemId, userId: f.userId },
          })
        : await this.prisma.planningFollower.findFirst({
            where: { planningItemId, email: f.email },
          });
      if (existing) continue;

      await this.prisma.planningFollower.create({
        data: {
          planningItemId,
          userId: f.userId,
          email: f.email,
          name: f.name,
        },
      });
    }
  }

  // ─── Internal helpers ─────────────────────────────────────

  private async cascadeProjectIdDown(projectId: string, tx?: any): Promise<void> {
    const client = tx || this.prisma;

    // Requests linked to this project → cascade to their quotes
    const requests = await client.request.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (requests.length) {
      const requestIds = requests.map((r: any) => r.id);
      await client.quote.updateMany({
        where: { requestId: { in: requestIds }, projectId: null },
        data: { projectId },
      });
    }

    // Quotes linked to this project → cascade to their planning items
    const quotes = await client.quote.findMany({
      where: { projectId },
      select: { id: true },
    });
    if (quotes.length) {
      const quoteIds = quotes.map((q: any) => q.id);
      await client.planningItem.updateMany({
        where: { quoteId: { in: quoteIds }, projectId: null },
        data: { projectId },
      });
    }
  }

  private async getInternalFollowerUserIds(projectId: string): Promise<string[]> {
    const followers = await this.prisma.projectFollower.findMany({
      where: { projectId, userId: { not: null } },
      select: { userId: true },
    });
    return followers.map((f) => f.userId!);
  }
}
