import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  User,
  Role,
  PlanningStatus,
  AcceptanceStatus,
  NotificationType,
  RescheduleStatus,
  SessionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
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
  AddFollowerDto,
  ListPlanningQueryDto,
  CreateRescheduleRequestDto,
  CreateSessionDto,
  UpdateSessionDto,
  AssignSessionInspectorsDto,
  RejectSessionDto,
  RescheduleSessionDto,
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

  private getPublicUrl(path: string): string {
    return `${this.config.get<string>('PUBLIC_URL', 'http://localhost:5173')}${path}`;
  }

  private checkOrgAccess(user: User, orgId: string): void {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== orgId) {
      throw new ForbiddenException();
    }
  }

  // ─── List & Detail ─────────────────────────────────────────

  async findAll(user: User, query: ListPlanningQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 25), 100);
    const skip = (page - 1) * limit;
    const { sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['scheduledDate', 'status', 'createdAt'];
    const orderBy: object = (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy))
      ? [{ [sortBy]: sortOrder }]
      : [{ scheduledDate: 'asc' }, { createdAt: 'desc' }];

    const where: any = {};
    if (!user.roles.includes(Role.SUPERUSER)) where.orgId = user.orgId!;
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

    const [data, total] = await Promise.all([
      this.prisma.planningItem.findMany({
        where,
        include: PLANNING_INCLUDE,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.planningItem.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      include: PLANNING_INCLUDE,
    });
    if (!item) throw new NotFoundException('Planregel niet gevonden');
    this.checkOrgAccess(user, item.orgId);
    return item;
  }

  // ─── Create ────────────────────────────────────────────────

  async create(dto: CreatePlanningItemDto, user: User) {
    const isMultiDay = dto.isMultiDay === true;
    const sessionCount = isMultiDay ? (dto.sessionCount ?? 2) : null;

    if (isMultiDay && (sessionCount ?? 0) < 2) {
      throw new BadRequestException('Meerdaagse planning vereist minimaal 2 sessies');
    }

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

    const data: any = {};
    if (dto.locationId !== undefined) data.locationId = dto.locationId;
    if (dto.contactPersonId !== undefined) data.contactPersonId = dto.contactPersonId ?? null;
    if (dto.productId !== undefined) data.productId = dto.productId ?? null;
    if (dto.productName !== undefined) data.productName = dto.productName;
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
    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        location: { select: { street: true, houseNumber: true, city: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    if (!item) throw new NotFoundException('Planregel niet gevonden');
    this.checkOrgAccess(user, item.orgId);
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

  private collectEmailRecipients(item: any): Array<{ email: string; name: string }> {
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

  // ─── Followers ─────────────────────────────────────────────

  async getFollowers(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.planningFollower.findMany({
      where: { planningItemId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addFollower(id: string, dto: AddFollowerDto, user: User) {
    await this.findOne(id, user);
    if (!dto.userId && !dto.email) {
      throw new BadRequestException('Geef een gebruiker ID of een e-mailadres op');
    }

    if (dto.userId) {
      const exists = await this.prisma.planningFollower.findFirst({
        where: { planningItemId: id, userId: dto.userId },
      });
      if (exists) throw new BadRequestException('Deze gebruiker is al een volger');
    } else {
      const exists = await this.prisma.planningFollower.findFirst({
        where: { planningItemId: id, email: dto.email },
      });
      if (exists) throw new BadRequestException('Dit e-mailadres is al een volger');
    }

    return this.prisma.planningFollower.create({
      data: {
        planningItemId: id,
        userId: dto.userId ?? null,
        email: dto.userId ? null : (dto.email ?? null),
        name: dto.name ?? null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async removeFollower(id: string, followerId: string, user: User) {
    await this.findOne(id, user);
    const follower = await this.prisma.planningFollower.findUnique({ where: { id: followerId } });
    if (!follower || follower.planningItemId !== id) {
      throw new NotFoundException('Volger niet gevonden');
    }
    await this.prisma.planningFollower.delete({ where: { id: followerId } });
  }

  // ─── Public portal ─────────────────────────────────────────

  async findByPublicToken(token: string) {
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      include: {
        contact: {
          select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
        },
        location: {
          select: {
            id: true,
            name: true,
            street: true,
            houseNumber: true,
            city: true,
            postalCode: true,
          },
        },
        inspectors: {
          where: { acceptanceStatus: AcceptanceStatus.ACCEPTED },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, color: true, initials: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }],
        },
        organization: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
        sessions: {
          where: { isCancelled: false },
          include: {
            sessionInspectors: {
              where: { acceptanceStatus: AcceptanceStatus.ACCEPTED },
              include: {
                user: { select: { id: true, firstName: true, lastName: true, color: true, initials: true } },
              },
              orderBy: [{ isPrimary: 'desc' as const }],
            },
          },
          orderBy: { sessionNumber: 'asc' as const },
        },
      },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');

    // Attach shared documents (from this planning item + linked quote + linked request)
    const documents = await this.getSharedDocuments(token);
    return { ...item, documents };
  }

  async addClientQuestion(token: string, dto: AddQuestionDto) {
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      select: { id: true, orgId: true, createdBy: true, productName: true },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');

    const entry = await this.prisma.planningHistory.create({
      data: { planningItemId: item.id, userId: null, action: 'VRAAG_KLANT', description: dto.message },
    });

    this.notifications.dispatch({
      type: NotificationType.AFSPRAAK_VERZETTEN_VERZOEK,
      orgId: item.orgId,
      recipientUserIds: [item.createdBy],
      title: 'Nieuwe vraag van klant',
      body: `Klant heeft een vraag gesteld bij afspraak "${item.productName}".`,
      entityType: 'planningItem',
      entityId: item.id,
    });

    return entry;
  }

  async createRescheduleRequest(token: string, dto: CreateRescheduleRequestDto) {
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      select: { id: true, orgId: true, createdBy: true, productName: true, isCancelled: true },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');
    if (item.isCancelled) throw new BadRequestException('Deze afspraak is al geannuleerd');

    const request = await this.prisma.rescheduleRequest.create({
      data: {
        planningItemId: item.id,
        clientName: dto.clientName ?? null,
        preferredDate: new Date(dto.preferredDate),
        reason: dto.reason,
        status: RescheduleStatus.PENDING,
      },
    });

    await this.addHistoryEntry(
      item.id,
      null,
      'VERZETTEN_VERZOEK',
      `Klant verzoekt afspraak te verzetten. Reden: ${dto.reason}`,
    );

    this.notifications.dispatch({
      type: NotificationType.AFSPRAAK_VERZETTEN_VERZOEK,
      orgId: item.orgId,
      recipientUserIds: [item.createdBy],
      title: 'Verzoek afspraak verzetten',
      body: `Klant verzoekt afspraak "${item.productName}" te verzetten. Reden: ${dto.reason}`,
      entityType: 'planningItem',
      entityId: item.id,
    });

    return request;
  }

  async getSharedDocuments(token: string) {
    const item = await this.prisma.planningItem.findUnique({
      where: { publicToken: token },
      select: { id: true, quoteId: true },
    });
    if (!item) throw new NotFoundException('Afspraak niet gevonden');

    // Build OR conditions: always include PLANNING docs, optionally QUOTE + REQUEST docs
    const entityFilters: Array<{ entityType: any; entityId: string }> = [
      { entityType: 'PLANNING' as any, entityId: item.id },
    ];
    if (item.quoteId) {
      entityFilters.push({ entityType: 'QUOTE' as any, entityId: item.quoteId });
      const quote = await this.prisma.quote.findUnique({
        where: { id: item.quoteId },
        select: { requestId: true },
      });
      if (quote?.requestId) {
        entityFilters.push({ entityType: 'REQUEST' as any, entityId: quote.requestId });
      }
    }

    return this.prisma.document.findMany({
      where: {
        OR: entityFilters,
        isSharedWithClient: true,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Sessions ──────────────────────────────────────────────

  private async findSession(planningItemId: string, sessionId: string) {
    const session = await this.prisma.planningSession.findUnique({
      where: { id: sessionId },
      include: {
        sessionInspectors: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Sessie niet gevonden');
    if (session.planningItemId !== planningItemId) throw new NotFoundException('Sessie niet gevonden');
    return session;
  }

  async findSessions(id: string, user: User) {
    await this.findOne(id, user);
    return this.prisma.planningSession.findMany({
      where: { planningItemId: id },
      include: {
        sessionInspectors: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } },
          },
          orderBy: [{ isPrimary: 'desc' }],
        },
      },
      orderBy: { sessionNumber: 'asc' },
    });
  }

  async addSession(id: string, dto: CreateSessionDto, user: User) {
    const item = await this.findOne(id, user);
    if (!item.isMultiDay) {
      throw new BadRequestException('Kan alleen sessies toevoegen aan meerdaagse planregels');
    }

    // Determine next session number
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId: id },
      orderBy: { sessionNumber: 'desc' },
    });
    const nextNumber = (sessions[0]?.sessionNumber ?? 0) + 1;

    // Update sessionCount on parent
    await this.prisma.planningItem.update({
      where: { id },
      data: { sessionCount: nextNumber },
    });

    const session = await this.prisma.planningSession.create({
      data: {
        planningItemId: id,
        sessionNumber: nextNumber,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        durationHours: dto.durationHours ?? null,
        notes: dto.notes ?? null,
        status: SessionStatus.NOG_TE_PLANNEN,
      },
    });

    await this.addHistoryEntry(id, user.id, 'SESSIE_TOEGEVOEGD', `Sessie ${nextNumber} toegevoegd`);
    return session;
  }

  async updateSession(id: string, sessionId: string, dto: UpdateSessionDto, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Definitieve sessies kunnen niet meer worden gewijzigd');
    }

    const updated = await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: {
        scheduledDate: dto.scheduledDate !== undefined ? (dto.scheduledDate ? new Date(dto.scheduledDate) : null) : undefined,
        durationHours: dto.durationHours !== undefined ? dto.durationHours : undefined,
        notes: dto.notes !== undefined ? dto.notes : undefined,
      },
    });

    await this.addHistoryEntry(id, user.id, 'SESSIE_BIJGEWERKT', `Sessie ${session.sessionNumber} bijgewerkt`);
    return updated;
  }

  async cancelSession(id: string, sessionId: string, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Definitieve sessies kunnen niet worden geannuleerd');
    }

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.VERVALLEN, isCancelled: true },
    });

    await this.addHistoryEntry(id, user.id, 'SESSIE_GEANNULEERD', `Sessie ${session.sessionNumber} geannuleerd`);

    // Check if all remaining sessions are definitief → parent GEPLAND
    await this.checkAllSessionsDefinitief(id);
  }

  async assignSessionInspectors(id: string, sessionId: string, dto: AssignSessionInspectorsDto, user: User) {
    const item = await this.findOne(id, user);
    if (!item.isMultiDay) {
      throw new BadRequestException('Gebruik /assign voor enkeldaagse planregels');
    }
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Kan geen inspecteurs toewijzen aan een definitieve sessie');
    }

    // Remove PENDING session inspectors for this session
    await this.prisma.planningSessionInspector.deleteMany({
      where: { sessionId, acceptanceStatus: AcceptanceStatus.PENDING },
    });

    for (const inspectorId of dto.inspectorIds) {
      await this.prisma.planningSessionInspector.upsert({
        where: { sessionId_userId: { sessionId, userId: inspectorId } },
        create: {
          sessionId,
          userId: inspectorId,
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
          acceptanceStatus: AcceptanceStatus.PENDING,
        },
        update: {
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
          acceptanceStatus: AcceptanceStatus.PENDING,
          acceptedAt: null,
          rejectedAt: null,
          rejectionNote: null,
        },
      });

      // Also ensure PlanningInspector exists on parent item
      await this.prisma.planningInspector.upsert({
        where: { planningItemId_userId: { planningItemId: id, userId: inspectorId } },
        create: {
          planningItemId: id,
          userId: inspectorId,
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
        },
        update: {
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
        },
      });
    }

    // Advance session to CONCEPT
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CONCEPT },
    });

    // Advance parent item to CONCEPT if still NOG_TE_PLANNEN
    if (item.status === PlanningStatus.NOG_TE_PLANNEN) {
      await this.prisma.planningItem.update({
        where: { id },
        data: { status: PlanningStatus.CONCEPT },
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'SESSIE_INSPECTEURS_TOEGEWEZEN',
      `Sessie ${session.sessionNumber}: ${dto.inspectorIds.length} inspecteur(s) toegewezen`,
    );

    // Notify inspectors (excluding actor)
    const toNotify = dto.inspectorIds.filter((iid) => iid !== user.id);
    if (toNotify.length > 0 && item.orgId) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
        orgId: item.orgId,
        recipientUserIds: toNotify,
        title: 'Afspraak acceptatie verzoek',
        body: `U bent toegewezen aan sessie ${session.sessionNumber} van afspraak "${item.productName}". Graag uw acceptatie.`,
        entityType: 'planningItem',
        entityId: id,
      });

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
            scheduledDate: session.scheduledDate,
            orgName: org?.name ?? 'InspeXi',
            sessionLabel: `Sessie ${session.sessionNumber}/${item.sessionCount ?? '?'}`,
            orgId: item.orgId,
          })
          .catch((err) => this.logger.error('Session acceptation email failed', err));
      }
    }

    return this.findSession(id, sessionId);
  }

  async acceptSession(id: string, sessionId: string, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    const si = await this.prisma.planningSessionInspector.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
    });
    if (!si) throw new ForbiddenException('U bent niet toegewezen aan deze sessie');
    if (si.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze sessie');
    }

    await this.prisma.planningSessionInspector.update({
      where: { sessionId_userId: { sessionId, userId: user.id } },
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
        title: 'Sessie geaccepteerd',
        body: `${user.firstName} ${user.lastName} heeft sessie ${session.sessionNumber} van "${item.productName}" geaccepteerd.`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'SESSIE_GEACCEPTEERD',
      `Sessie ${session.sessionNumber}: geaccepteerd door ${user.firstName} ${user.lastName}`,
    );

    await this.checkSessionAllAccepted(id, sessionId);
  }

  async rejectSession(id: string, sessionId: string, dto: RejectSessionDto, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    const si = await this.prisma.planningSessionInspector.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
    });
    if (!si) throw new ForbiddenException('U bent niet toegewezen aan deze sessie');
    if (si.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze sessie');
    }

    await this.prisma.planningSessionInspector.update({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      data: { acceptanceStatus: AcceptanceStatus.REJECTED, rejectedAt: new Date(), rejectionNote: dto.reason },
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
        title: 'Sessie geweigerd',
        body: `${user.firstName} ${user.lastName} heeft sessie ${session.sessionNumber} van "${item.productName}" geweigerd. Reden: ${dto.reason}`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.addHistoryEntry(
      id,
      user.id,
      'SESSIE_GEWEIGERD',
      `Sessie ${session.sessionNumber}: geweigerd door ${user.firstName} ${user.lastName}. Reden: ${dto.reason}`,
    );
  }

  async confirmSession(id: string, sessionId: string, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF) {
      throw new BadRequestException('Sessie is al definitief');
    }
    if (!session.scheduledDate) {
      throw new BadRequestException('Stel eerst een datum in voor deze sessie');
    }

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.DEFINITIEF, isDefinitief: true, confirmedAt: new Date(), confirmedBy: user.id },
    });

    await this.addHistoryEntry(
      id,
      user.id,
      'SESSIE_DEFINITIEF',
      `Sessie ${session.sessionNumber} handmatig bevestigd als definitief`,
    );

    // Send confirmation email for this session
    await this.doSendSessionConfirmationEmailsById(id, sessionId);

    // Check if all sessions DEFINITIEF → parent GEPLAND
    await this.checkAllSessionsDefinitief(id);
  }

  async rescheduleSession(id: string, sessionId: string, dto: RescheduleSessionDto, user: User) {
    const item = await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    // Mark old session VERVALLEN
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.VERVALLEN, isCancelled: true },
    });

    // Create new session with same sessionNumber
    const newSession = await this.prisma.planningSession.create({
      data: {
        planningItemId: id,
        sessionNumber: session.sessionNumber,
        status: SessionStatus.NOG_TE_PLANNEN,
        durationHours: session.durationHours,
        replacesId: sessionId,
        originalDate: session.scheduledDate,
      },
    });

    // Link back
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { replacedById: newSession.id },
    });

    await this.addHistoryEntry(
      id,
      user.id,
      'SESSIE_VERPLAATST',
      `Sessie ${session.sessionNumber} verplaatst. Reden: ${dto.reason}`,
    );

    // Send reschedule emails to contact + followers
    const fullItem = await this.prisma.planningItem.findUnique({
      where: { id },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    if (fullItem) {
      this.doSendSessionRescheduleEmails(fullItem, session, dto.reason).catch((err) =>
        this.logger.error('Failed to send session reschedule emails', err),
      );
    }

    return newSession;
  }

  async completeSession(id: string, sessionId: string, user: User) {
    await this.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.AFGEROND },
    });

    await this.addHistoryEntry(id, user.id, 'SESSIE_AFGEROND', `Sessie ${session.sessionNumber} afgerond`);

    // If all non-cancelled sessions are AFGEROND → parent AFGEROND
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId: id, isCancelled: false },
    });
    if (sessions.length > 0 && sessions.every((s) => s.status === SessionStatus.AFGEROND)) {
      await this.prisma.planningItem.update({
        where: { id },
        data: { status: PlanningStatus.AFGEROND },
      });
      await this.addHistoryEntry(id, null, 'AFGEROND', 'Alle sessies afgerond — planregel afgerond');
    }
  }

  // ─── Session private helpers ───────────────────────────────

  private async checkSessionAllAccepted(planningItemId: string, sessionId: string) {
    const inspectors = await this.prisma.planningSessionInspector.findMany({
      where: { sessionId },
    });
    if (inspectors.length === 0) return;
    if (!inspectors.every((i) => i.acceptanceStatus === AcceptanceStatus.ACCEPTED)) return;

    // All accepted → DEFINITIEF (only if a date has been set)
    const session = await this.prisma.planningSession.findUnique({
      where: { id: sessionId },
      select: { sessionNumber: true, scheduledDate: true },
    });
    if (!session?.scheduledDate) {
      // All inspectors accepted but no date yet — stay at CONCEPT until date is set
      return;
    }
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.DEFINITIEF, isDefinitief: true, confirmedAt: new Date() },
    });

    await this.addHistoryEntry(
      planningItemId,
      null,
      'SESSIE_DEFINITIEF',
      `Sessie ${session?.sessionNumber} is definitief — alle inspecteurs geaccepteerd`,
    );

    // Send session confirmation email
    await this.doSendSessionConfirmationEmailsById(planningItemId, sessionId);

    // Check if all sessions DEFINITIEF → parent GEPLAND
    await this.checkAllSessionsDefinitief(planningItemId);
  }

  private async checkAllSessionsDefinitief(planningItemId: string) {
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId, isCancelled: false },
    });
    if (sessions.length === 0) return;
    if (!sessions.every((s) => s.status === SessionStatus.DEFINITIEF || s.status === SessionStatus.AFGEROND)) return;

    const item = await this.prisma.planningItem.findUnique({
      where: { id: planningItemId },
      select: { status: true, orgId: true, createdBy: true, productName: true },
    });
    if (!item || item.status === PlanningStatus.GEPLAND || item.status === PlanningStatus.AFGEROND) return;

    await this.prisma.planningItem.update({
      where: { id: planningItemId },
      data: { status: PlanningStatus.GEPLAND },
    });

    await this.addHistoryEntry(
      planningItemId,
      null,
      'GEPLAND',
      'Alle sessies definitief — planregel bevestigd',
    );

    this.notifications.dispatch({
      type: NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD,
      orgId: item.orgId,
      recipientUserIds: [item.createdBy],
      title: 'Alle sessies bevestigd',
      body: `Alle sessies van "${item.productName}" zijn definitief.`,
      entityType: 'planningItem',
      entityId: planningItemId,
    });
  }

  private async doSendSessionConfirmationEmailsById(planningItemId: string, sessionId: string) {
    const item = await this.prisma.planningItem.findUnique({
      where: { id: planningItemId },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        location: { select: { name: true, street: true, houseNumber: true, city: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    const session = await this.prisma.planningSession.findUnique({ where: { id: sessionId } });
    if (!item || !session) return;

    const portalUrl = this.getPublicUrl(`/afspraak/${item.publicToken}`);
    const locationName = item.location
      ? [item.location.street, item.location.houseNumber, item.location.city].filter(Boolean).join(' ')
      : undefined;

    const recipients = this.collectEmailRecipients(item);
    for (const r of recipients) {
      this.planningEmail
        .sendSessionConfirmation({
          to: r.email,
          recipientName: r.name,
          productName: item.productName,
          sessionNumber: session.sessionNumber,
          totalSessions: item.sessionCount ?? 1,
          scheduledDate: session.scheduledDate,
          durationHours: session.durationHours,
          locationName,
          orgName: item.organization?.name ?? 'InspeXi',
          portalUrl,
          orgId: item.orgId,
        })
        .catch((err) => this.logger.error('Session confirmation email failed', err));
    }
  }

  private async doSendSessionRescheduleEmails(item: any, session: any, reason: string) {
    const recipients = this.collectEmailRecipients(item);
    for (const r of recipients) {
      await this.planningEmail.sendRescheduleNotification({
        to: r.email,
        recipientName: r.name,
        productName: `${item.productName} (sessie ${session.sessionNumber})`,
        reason,
        orgName: item.organization?.name ?? 'InspeXi',
        newPortalUrl: this.getPublicUrl(`/afspraak/${item.publicToken}`),
        orgId: item.orgId,
      });
    }
  }

  // ─── History helper ────────────────────────────────────────

  private async addHistoryEntry(
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
