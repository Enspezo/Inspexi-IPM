import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  User,
  PlanningStatus,
  AcceptanceStatus,
  NotificationType,
  SessionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound, assertSameOrg, assertAllSameOrg, assertOrgAccess, resolvePhaseLink } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { PlanningEmailService } from './planning-email.service';
import {
  CreatePlanningItemDto,
  UpdatePlanningItemDto,
  AssignInspectorsDto,
  RejectPlanningDto,
  ReschedulePlanningDto,
  AddQuestionDto,
  ListPlanningQueryDto,
} from './dto';

const PLANNING_INCLUDE = {
  contact: {
    select: {
      id: true,
      type: true,
      companyName: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  contactPerson: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
    },
  },
  location: {
    select: {
      id: true,
      name: true,
      street: true,
      houseNumber: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
    },
  },
  createdByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  inspectors: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          color: true,
          initials: true,
          homeLat: true,
          homeLng: true,
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' as const }],
  },
  followers: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  history: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  sessions: {
    where: { isCancelled: false },
    include: {
      sessionInspectors: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              color: true,
              initials: true,
              homeLat: true,
              homeLng: true,
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' as const }],
      },
    },
    orderBy: { sessionNumber: 'asc' as const },
  },
  project: { select: { id: true, projectNumber: true } },
  projectPhase: { select: { id: true, name: true, sortOrder: true, status: true } },
};

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private workOrdersService: WorkOrdersService,
    private planningEmail: PlanningEmailService,
    private config: ConfigService,
  ) {}

  getPublicUrl(path: string): string {
    return `${this.config.get<string>('PUBLIC_URL', 'http://localhost:5173')}${path}`;
  }

  // ─── List & Detail ─────────────────────────────────────────

  async findAll(user: User, query: ListPlanningQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 25), 100);
    const { sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['scheduledDate', 'status', 'createdAt'];
    const orderBy: object = (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy))
      ? [{ [sortBy]: sortOrder }]
      : [{ scheduledDate: 'asc' }, { createdAt: 'desc' }];

    const where: any = { ...orgScope(user) };
    if (query.status) where.status = query.status;
    if (query.contactId) where.contactId = query.contactId;
    if (query.inspectorId) where.inspectors = { some: { userId: query.inspectorId } };
    if (query.showCancelled !== 'true') where.isCancelled = false;

    // Build AND conditions for date range + search (both can use OR internally)
    const andConditions: any[] = [];

    if (query.dateFrom || query.dateTo) {
      const dateRange: any = {};
      if (query.dateFrom) dateRange.gte = new Date(query.dateFrom);
      if (query.dateTo) dateRange.lte = new Date(query.dateTo);
      // Match single-day items on scheduledDate OR multi-day items with at least one session in range
      andConditions.push({
        OR: [
          { scheduledDate: dateRange },
          { sessions: { some: { scheduledDate: dateRange, isCancelled: false } } },
        ],
      });
    }

    if (query.search && query.search.length >= 3) {
      const term = query.search;
      andConditions.push({
        OR: [
          { productName: { contains: term, mode: 'insensitive' } },
          { contact: { companyName: { contains: term, mode: 'insensitive' } } },
          { contact: { firstName: { contains: term, mode: 'insensitive' } } },
          { contact: { lastName: { contains: term, mode: 'insensitive' } } },
          { location: { name: { contains: term, mode: 'insensitive' } } },
          { location: { street: { contains: term, mode: 'insensitive' } } },
          { location: { city: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    if (andConditions.length > 0) where.AND = andConditions;

    return paginate(this.prisma.planningItem, {
      where,
      include: PLANNING_INCLUDE,
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const item = assertFound(
      await this.prisma.planningItem.findUnique({
        where: { id },
        include: PLANNING_INCLUDE,
      }),
      'Planregel',
    );
    assertOrgAccess(user, item.orgId);
    return item;
  }

  // ─── Create ────────────────────────────────────────────────

  async create(dto: CreatePlanningItemDto, user: User) {
    const isMultiDay = dto.isMultiDay === true;
    const sessionCount = isMultiDay ? (dto.sessionCount ?? 2) : null;

    if (isMultiDay && (sessionCount ?? 0) < 2) {
      throw new BadRequestException('Meerdaagse planning vereist minimaal 2 sessies');
    }

    // Verify all foreign keys belong to the user's organization
    await assertSameOrg(this.prisma.contact, dto.contactId, user.orgId, 'Relatie');
    await assertSameOrg(this.prisma.location, dto.locationId, user.orgId, 'Locatie');
    await assertSameOrg(this.prisma.contactPerson, dto.contactPersonId, user.orgId, 'Contactpersoon');
    await assertSameOrg(this.prisma.quote, dto.quoteId, user.orgId, 'Offerte');
    await assertSameOrg(this.prisma.product, dto.productId, user.orgId, 'Product');

    const item = await this.prisma.planningItem.create({
      data: {
        orgId: user.orgId!,
        contactId: dto.contactId,
        contactPersonId: dto.contactPersonId ?? null,
        locationId: dto.locationId,
        quoteId: dto.quoteId ?? null,
        productId: dto.productId ?? null,
        productName: dto.productName,
        // For multi-day: no scheduledDate on the parent item
        scheduledDate: !isMultiDay && dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        durationHours: dto.durationHours ?? null,
        internalNotes: dto.internalNotes ?? null,
        labels: dto.labels ?? [],
        createdBy: user.id,
        status: PlanningStatus.NOG_TE_PLANNEN,
        isMultiDay,
        sessionCount,
      },
      include: PLANNING_INCLUDE,
    });

    // Auto-create session stubs for multi-day items
    if (isMultiDay && sessionCount) {
      const sessionDurationHours = dto.durationHours
        ? dto.durationHours / sessionCount
        : null;

      for (let i = 1; i <= sessionCount; i++) {
        await this.prisma.planningSession.create({
          data: {
            planningItemId: item.id,
            sessionNumber: i,
            status: SessionStatus.NOG_TE_PLANNEN,
            durationHours: sessionDurationHours ?? null,
          },
        });
      }
    }

    await this.addHistoryEntry(item.id, user.id, 'AANGEMAAKT', 'Planregel aangemaakt');
    return this.findOne(item.id, user);
  }

  async createFromQuote(quote: {
    id: string;
    orgId: string;
    contactId: string;
    locationId: string | null;
    createdBy: string;
    quoteNumber: string;
    projectId?: string;
  }) {
    if (!quote.locationId) {
      this.logger.warn(`Skipping planning item for quote ${quote.id}: no location`);
      return;
    }

    // Fetch first line for product name
    const firstLine = await this.prisma.quoteLine.findFirst({
      where: { quoteId: quote.id },
      orderBy: { sortOrder: 'asc' },
      select: { description: true, productId: true },
    });

    const productName = firstLine?.description ?? `Inspectie (offerte ${quote.quoteNumber})`;
    const productId = firstLine?.productId ?? null;

    const item = await this.prisma.planningItem.create({
      data: {
        orgId: quote.orgId,
        contactId: quote.contactId,
        locationId: quote.locationId,
        quoteId: quote.id,
        projectId: quote.projectId ?? null,
        productId,
        productName,
        status: PlanningStatus.NOG_TE_PLANNEN,
        createdBy: quote.createdBy,
      },
    });

    await this.addHistoryEntry(item.id, quote.createdBy, 'AANGEMAAKT', `Planregel automatisch aangemaakt na acceptatie offerte ${quote.quoteNumber}`);
    this.logger.log(`Planning item created for quote ${quote.quoteNumber}`);
  }

  // ─── Update ────────────────────────────────────────────────

  async update(id: string, dto: UpdatePlanningItemDto, user: User) {
    const existing = await this.findOne(id, user);

    // Projectfase-koppeling (PRD-12): valideer org + projectconsistentie en
    // cascadeer het project van de fase naar de planregel wanneer die er nog geen heeft.
    const phaseLink = await resolvePhaseLink(
      this.prisma.projectPhase, dto.projectPhaseId, user.orgId, existing.projectId,
    );

    const data: any = {};
    if (dto.locationId !== undefined) data.locationId = dto.locationId;
    if (dto.contactPersonId !== undefined) data.contactPersonId = dto.contactPersonId ?? null;
    if (dto.productId !== undefined) data.productId = dto.productId ?? null;
    if (dto.productName !== undefined) data.productName = dto.productName;
    if (phaseLink !== undefined) {
      data.projectPhaseId = phaseLink.phaseId;
      if (phaseLink.projectId && existing.projectId == null) data.projectId = phaseLink.projectId;
    }
    if (dto.scheduledDate !== undefined) {
      data.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    }
    if (dto.durationHours !== undefined) data.durationHours = dto.durationHours ?? null;
    if (dto.internalNotes !== undefined) data.internalNotes = dto.internalNotes ?? null;
    if (dto.labels !== undefined) data.labels = dto.labels;

    const updated = await this.prisma.planningItem.update({
      where: { id },
      data,
      include: PLANNING_INCLUDE,
    });

    // Stuur notificatie naar inspecteurs als de datum gewijzigd is bij CONCEPT of NOG_TE_PLANNEN
    const dateChanged =
      dto.scheduledDate !== undefined &&
      (existing.scheduledDate?.toISOString() ?? null) !== (updated.scheduledDate?.toISOString() ?? null);

    if (
      dateChanged &&
      updated.scheduledDate &&
      (existing.status === PlanningStatus.CONCEPT || existing.status === PlanningStatus.NOG_TE_PLANNEN)
    ) {
      const inspectorUserIds = (existing.inspectors as any[])
        .filter((i) => i.userId)
        .map((i) => i.userId as string)
        .filter((uid) => uid !== user.id);

      if (inspectorUserIds.length > 0) {
        const newDateFormatted = new Date(updated.scheduledDate).toLocaleDateString('nl-NL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        this.notifications.dispatch({
          type: NotificationType.AFSPRAAK_VERPLAATST,
          orgId: existing.orgId,
          recipientUserIds: inspectorUserIds,
          title: 'Afspraakdatum gewijzigd',
          body: `De datum van afspraak "${existing.productName}" is gewijzigd naar ${newDateFormatted}.`,
          entityType: 'planningItem',
          entityId: id,
        });
      }
    }

    await this.addHistoryEntry(id, user.id, 'BIJGEWERKT', 'Planregel bijgewerkt');
    return updated;
  }

  // ─── Inspector assignment ──────────────────────────────────

  async assignInspectors(id: string, dto: AssignInspectorsDto, user: User) {
    const item = await this.findOne(id, user);

    // Inspectors must belong to the same organization as the planning item
    await assertAllSameOrg(this.prisma.user, dto.inspectorIds, item.orgId, 'inspecteurs');

    // Remove pending (non-responded) inspectors
    await this.prisma.planningInspector.deleteMany({
      where: { planningItemId: id, acceptanceStatus: AcceptanceStatus.PENDING },
    });

    for (const inspectorId of dto.inspectorIds) {
      await this.prisma.planningInspector.upsert({
        where: { planningItemId_userId: { planningItemId: id, userId: inspectorId } },
        create: {
          planningItemId: id,
          userId: inspectorId,
          isPrimary: inspectorId === dto.primaryInspectorId,
          acceptanceStatus: AcceptanceStatus.PENDING,
        },
        update: {
          isPrimary: inspectorId === dto.primaryInspectorId,
          acceptanceStatus: AcceptanceStatus.PENDING,
          acceptedAt: null,
          rejectedAt: null,
          rejectionNote: null,
        },
      });
    }

    // Advance to CONCEPT
    if (item.status === PlanningStatus.NOG_TE_PLANNEN) {
      await this.prisma.planningItem.update({
        where: { id },
        data: { status: PlanningStatus.CONCEPT },
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'INSPECTEURS_TOEGEWEZEN',
      `${dto.inspectorIds.length} inspecteur(s) toegewezen`,
    );

    // Notify inspectors (excluding the actor)
    const toNotify = dto.inspectorIds.filter((iid) => iid !== user.id);
    if (toNotify.length > 0 && item.orgId) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
        orgId: item.orgId,
        recipientUserIds: toNotify,
        title: 'Afspraak acceptatie verzoek',
        body: `U bent toegewezen aan afspraak "${item.productName}". Graag uw acceptatie.`,
        entityType: 'planningItem',
        entityId: id,
      });

      // Also send email to each inspector
      const inspectors = await this.prisma.user.findMany({
        where: { id: { in: toNotify } },
        select: { email: true, firstName: true, lastName: true },
      });
      const org = await this.prisma.organization.findUnique({
        where: { id: item.orgId },
        select: { name: true },
      });
      for (const inspector of inspectors) {
        this.planningEmail
          .sendAcceptationRequest({
            to: inspector.email,
            recipientName: `${inspector.firstName} ${inspector.lastName}`,
            productName: item.productName,
            scheduledDate: item.scheduledDate,
            orgName: org?.name ?? 'InspeXi',
            orgId: item.orgId,
          })
          .catch((err) => this.logger.error('Acceptation email failed', err));
      }
    }

    return this.findOne(id, user);
  }

  // ─── Accept ────────────────────────────────────────────────

  async acceptPlanning(id: string, user: User) {
    // Guard: multi-day items use per-session acceptance
    const planningItem = await this.prisma.planningItem.findUnique({ where: { id }, select: { isMultiDay: true } });
    if (planningItem?.isMultiDay) {
      throw new BadRequestException('Gebruik de sessie-endpoints voor acceptatie van meerdaagse planning');
    }

    const inspector = await this.prisma.planningInspector.findUnique({
      where: { planningItemId_userId: { planningItemId: id, userId: user.id } },
    });
    if (!inspector) throw new ForbiddenException('U bent niet toegewezen aan deze afspraak');
    if (inspector.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze afspraak');
    }

    await this.prisma.planningInspector.update({
      where: { planningItemId_userId: { planningItemId: id, userId: user.id } },
      data: { acceptanceStatus: AcceptanceStatus.ACCEPTED, acceptedAt: new Date() },
    });

    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      select: { orgId: true, createdBy: true, productName: true },
    });

    if (item && item.createdBy !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_GEACCEPTEERD,
        orgId: item.orgId,
        recipientUserIds: [item.createdBy],
        title: 'Afspraak geaccepteerd',
        body: `${user.firstName} ${user.lastName} heeft afspraak "${item.productName}" geaccepteerd.`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'GEACCEPTEERD',
      `${user.firstName} ${user.lastName} heeft de afspraak geaccepteerd`,
    );

    await this.checkAllAccepted(id);
  }

  // ─── Reject ────────────────────────────────────────────────

  async rejectPlanning(id: string, dto: RejectPlanningDto, user: User) {
    // Guard: multi-day items use per-session rejection
    const planningItem = await this.prisma.planningItem.findUnique({ where: { id }, select: { isMultiDay: true } });
    if (planningItem?.isMultiDay) {
      throw new BadRequestException('Gebruik de sessie-endpoints voor weigering van meerdaagse planning');
    }

    const inspector = await this.prisma.planningInspector.findUnique({
      where: { planningItemId_userId: { planningItemId: id, userId: user.id } },
    });
    if (!inspector) throw new ForbiddenException('U bent niet toegewezen aan deze afspraak');
    if (inspector.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze afspraak');
    }

    await this.prisma.planningInspector.update({
      where: { planningItemId_userId: { planningItemId: id, userId: user.id } },
      data: {
        acceptanceStatus: AcceptanceStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionNote: dto.reason,
      },
    });

    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      select: { orgId: true, createdBy: true, productName: true },
    });

    if (item && item.createdBy !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_GEWEIGERD,
        orgId: item.orgId,
        recipientUserIds: [item.createdBy],
        title: 'Afspraak geweigerd',
        body: `${user.firstName} ${user.lastName} heeft afspraak "${item.productName}" geweigerd. Reden: ${dto.reason}`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'GEWEIGERD',
      `${user.firstName} ${user.lastName} heeft de afspraak geweigerd: ${dto.reason}`,
    );
  }

  // ─── Check all accepted → GEPLAND ─────────────────────────

  private async checkAllAccepted(planningItemId: string) {
    const inspectors = await this.prisma.planningInspector.findMany({
      where: { planningItemId },
    });
    if (inspectors.length === 0) return;
    if (!inspectors.every((i) => i.acceptanceStatus === AcceptanceStatus.ACCEPTED)) return;

    await this.prisma.planningItem.update({
      where: { id: planningItemId },
      data: { status: PlanningStatus.GEPLAND },
    });

    const item = await this.prisma.planningItem.findUnique({
      where: { id: planningItemId },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        location: { select: { name: true, street: true, houseNumber: true, city: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    if (!item) return;

    await this.addHistoryEntry(
      planningItemId,
      null,
      'GEPLAND',
      'Alle inspecteurs geaccepteerd — afspraak bevestigd',
    );

    this.notifications.dispatch({
      type: NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD,
      orgId: item.orgId,
      recipientUserIds: [item.createdBy],
      title: 'Afspraak bevestigd',
      body: `Alle inspecteurs hebben "${item.productName}" geaccepteerd. Bevestiging wordt verstuurd.`,
      entityType: 'planningItem',
      entityId: planningItemId,
    });

    this.doSendConfirmationEmails(item).catch((err) =>
      this.logger.error('Failed to send confirmation emails', err),
    );
  }

  // ─── Complete ──────────────────────────────────────────────

  async completePlanning(id: string, user: User) {
    const item = await this.findOne(id, user);
    if (item.status === PlanningStatus.AFGEROND) {
      throw new BadRequestException('Planregel is al afgerond');
    }
    await this.prisma.planningItem.update({
      where: { id },
      data: { status: PlanningStatus.AFGEROND },
    });
    await this.addHistoryEntry(id, user.id, 'AFGEROND', 'Afspraak gemarkeerd als afgerond');
  }

  // ─── Direct status update ──────────────────────────────────

  async updatePlanningStatus(id: string, dto: { status: PlanningStatus; note?: string }, user: User) {
    const item = await this.findOne(id, user);
    const oldStatus = item.status;
    if (oldStatus === dto.status) {
      throw new BadRequestException('Status is al ingesteld op de gewenste waarde');
    }
    await this.prisma.planningItem.update({
      where: { id },
      data: { status: dto.status },
    });
    const note = dto.note ? ` — ${dto.note}` : '';
    await this.addHistoryEntry(
      id,
      user.id,
      'STATUS_GEWIJZIGD',
      `Status gewijzigd van ${oldStatus} naar ${dto.status}${note}`,
    );

    // Auto-create work order when status transitions to GEPLAND
    if (dto.status === PlanningStatus.GEPLAND && oldStatus !== PlanningStatus.GEPLAND) {
      this.workOrdersService
        .createFromPlanningItem({
          id: item.id,
          orgId: item.orgId,
          locationId: item.locationId ?? null,
          createdBy: user.id,
        })
        .catch((err) => this.logger.error('Failed to auto-create work order for planning item', err));
    }

    return this.findOne(id, user);
  }

  // ─── Staff reschedule ──────────────────────────────────────

  async reschedulePlanning(id: string, dto: ReschedulePlanningDto, user: User) {
    const item = await this.findOne(id, user);
    // Guard: multi-day items use per-session reschedule
    if (item.isMultiDay) {
      throw new BadRequestException('Gebruik de sessie-endpoints voor het verzetten van meerdaagse planning');
    }

    await this.prisma.planningItem.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancelReason: dto.reason,
        status: PlanningStatus.VERVALLEN,
        labels: [...item.labels, 'Verplaatst'],
      },
    });

    await this.addHistoryEntry(id, user.id, 'VERPLAATST', `Afspraak verplaatst. Reden: ${dto.reason}`);

    const newItem = await this.prisma.planningItem.create({
      data: {
        orgId: item.orgId,
        contactId: item.contactId,
        locationId: item.locationId,
        quoteId: item.quoteId,
        productId: item.productId,
        productName: item.productName,
        status: PlanningStatus.NOG_TE_PLANNEN,
        internalNotes: item.internalNotes,
        labels: item.labels.filter((l) => l !== 'Verplaatst'),
        createdBy: user.id,
        replacesId: id,
        originalDate: item.scheduledDate,
      },
      include: PLANNING_INCLUDE,
    });

    await this.prisma.planningItem.update({
      where: { id },
      data: { replacedById: newItem.id },
    });

    await this.addHistoryEntry(
      newItem.id,
      user.id,
      'AANGEMAAKT',
      'Nieuwe planregel aangemaakt ter vervanging van eerdere afspraak',
    );

    // Send reschedule emails
    const fullItem = await this.prisma.planningItem.findUnique({
      where: { id },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });

    if (fullItem) {
      this.doSendRescheduleEmails(fullItem, dto.reason, newItem.publicToken).catch((err) =>
        this.logger.error('Failed to send reschedule emails', err),
      );
    }

    return newItem;
  }

  // ─── Send confirmation ─────────────────────────────────────

  async sendConfirmation(id: string, user: User) {
    const item = assertFound(
      await this.prisma.planningItem.findUnique({
        where: { id },
        include: {
          contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
          location: { select: { street: true, houseNumber: true, city: true } },
          followers: { include: { user: { select: { email: true, firstName: true } } } },
          organization: { select: { name: true } },
        },
      }),
      'Planregel',
    );
    assertOrgAccess(user, item.orgId);
    await this.doSendConfirmationEmails(item);
    await this.addHistoryEntry(id, user.id, 'BEVESTIGING_VERSTUURD', 'Bevestigings-e-mail handmatig verstuurd');
  }

  private async doSendConfirmationEmails(item: any) {
    const portalUrl = this.getPublicUrl(`/afspraak/${item.publicToken}`);
    const locationName = item.location
      ? [item.location.street, item.location.houseNumber, item.location.city].filter(Boolean).join(' ')
      : undefined;

    const recipients = this.collectEmailRecipients(item);
    for (const r of recipients) {
      await this.planningEmail.sendConfirmation({
        to: r.email,
        recipientName: r.name,
        productName: item.productName,
        scheduledDate: item.scheduledDate,
        durationHours: item.durationHours,
        locationName,
        orgName: item.organization?.name ?? 'InspeXi',
        portalUrl,
        orgId: item.orgId,
      });
    }
  }

  private async doSendRescheduleEmails(item: any, reason: string, newPublicToken: string) {
    const newPortalUrl = this.getPublicUrl(`/afspraak/${newPublicToken}`);
    const recipients = this.collectEmailRecipients(item);
    for (const r of recipients) {
      await this.planningEmail.sendRescheduleNotification({
        to: r.email,
        recipientName: r.name,
        productName: item.productName,
        reason,
        orgName: item.organization?.name ?? 'InspeXi',
        newPortalUrl,
        orgId: item.orgId,
      });
    }
  }

  collectEmailRecipients(item: any): Array<{ email: string; name: string }> {
    const recipients: Array<{ email: string; name: string }> = [];
    if (item.contact?.email) {
      const name =
        item.contact.companyName ||
        `${item.contact.firstName ?? ''} ${item.contact.lastName ?? ''}`.trim() ||
        item.contact.email;
      recipients.push({ email: item.contact.email, name });
    }
    for (const f of item.followers ?? []) {
      const email = f.user?.email ?? f.email;
      const name = f.name ?? f.user?.firstName ?? email;
      if (email) recipients.push({ email, name });
    }
    return recipients;
  }

  // ─── Questions ─────────────────────────────────────────────

  async getQuestions(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.planningHistory.findMany({
      where: { planningItemId: id, action: { in: ['VRAAG', 'VRAAG_KLANT', 'ANTWOORD'] } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addQuestion(id: string, dto: AddQuestionDto, user: User) {
    await this.findOne(id, user);
    return this.prisma.planningHistory.create({
      data: {
        planningItemId: id,
        userId: user.id,
        action: dto.isFromClient ? 'VRAAG_KLANT' : 'VRAAG',
        description: dto.message,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // ─── History helper ────────────────────────────────────────

  async addHistoryEntry(
    planningItemId: string,
    userId: string | null,
    action: string,
    description: string,
    oldValue?: string,
    newValue?: string,
  ) {
    await this.prisma.planningHistory
      .create({ data: { planningItemId, userId, action, description, oldValue, newValue } })
      .catch((err) => this.logger.error('Failed to write planning history', err));
  }
}
