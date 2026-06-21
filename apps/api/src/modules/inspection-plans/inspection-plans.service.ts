import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  paginate,
  buildOrderBy,
  orgScope,
  assertFound,
  assertSameOrg,
  requireOrg,
  STATUS_DRAFT,
  STATUS_IN_PROGRESS,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
  STATUS_APPROVED,
} from '@/common';
import { LookupService, LOOKUP_KIND, type LookupKind } from '../lookups/lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateInspectionPlanDto,
  UpdateInspectionPlanDto,
  ListInspectionPlansQueryDto,
  SubmitInspectionPlanDto,
  ReviewInspectionPlanDto,
} from './dto';

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const contactSelect = {
  id: true,
  companyName: true,
  firstName: true,
  lastName: true,
};

@Injectable()
export class InspectionPlansService {
  constructor(
    private prisma: PrismaService,
    private lookups: LookupService,
    private notifications: NotificationsService,
  ) {}

  /** Template mag een systeemtemplate (orgId null) of een eigen-org template zijn. */
  private async assertTemplateUsable(
    id: string | undefined,
    orgId: string,
  ): Promise<void> {
    if (!id) return;
    const tpl = await this.prisma.inspectionTemplate.findUnique({
      where: { id },
      select: { orgId: true },
    });
    if (!tpl) throw new BadRequestException('Inspectie-template niet gevonden');
    if (tpl.orgId !== null && tpl.orgId !== orgId) {
      throw new ForbiddenException('Template hoort niet bij uw organisatie');
    }
  }

  private async assertNormExists(code: string): Promise<void> {
    const norm = await this.prisma.normTypeDefinition.findUnique({
      where: { code },
      select: { isActive: true },
    });
    if (!norm || !norm.isActive) {
      throw new BadRequestException(`Onbekende of inactieve norm: ${code}`);
    }
  }

  private async assertLookup(
    kind: LookupKind,
    code: string | undefined,
    orgId: string,
  ): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup(kind, code, orgId);
    if (!row) throw new BadRequestException(`Onbekende waarde "${code}" voor ${kind}`);
  }

  // ─── Notification helper ───────────────────────────────

  private notify(
    type: NotificationType,
    plan: { id: string; orgId: string; projectName: string },
    recipientUserIds: string[],
  ): void {
    if (recipientUserIds.length === 0) return;

    const messages: Record<string, { title: string; body: string }> = {
      [NotificationType.INSPECTIEPLAN_TOEGEWEZEN]: {
        title: 'Inspectieplan toegewezen',
        body: `Inspectieplan "${plan.projectName}" is aan u toegewezen.`,
      },
      [NotificationType.INSPECTIEPLAN_TER_REVIEW]: {
        title: 'Inspectieplan ter review',
        body: `Inspectieplan "${plan.projectName}" staat klaar voor review.`,
      },
      [NotificationType.INSPECTIEPLAN_GOEDGEKEURD]: {
        title: 'Inspectieplan goedgekeurd',
        body: `Inspectieplan "${plan.projectName}" is goedgekeurd.`,
      },
      [NotificationType.INSPECTIEPLAN_AFGEKEURD]: {
        title: 'Inspectieplan afgekeurd',
        body: `Inspectieplan "${plan.projectName}" is afgekeurd.`,
      },
    };

    const message = messages[type];
    this.notifications.dispatch({
      type,
      orgId: plan.orgId,
      recipientUserIds,
      title: message.title,
      body: message.body,
      entityType: 'inspectionPlan',
      entityId: plan.id,
    });
  }

  async findAll(user: User, query: ListInspectionPlansQueryDto) {
    const {
      search,
      statusCode,
      contactId,
      onlyMine,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder = 'desc',
    } = query;
    const orderBy = buildOrderBy(
      sortBy,
      sortOrder,
      ['projectName', 'statusCode', 'plannedDate', 'deadline', 'createdAt'],
      { createdAt: 'desc' },
    );

    const where: Prisma.InspectionPlanWhereInput = {
      ...orgScope(user),
      deletedAt: null,
    };
    if (statusCode) where.statusCode = statusCode;
    if (contactId) where.contactId = contactId;
    if (onlyMine === 'true') where.assignedTo = user.id;
    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { referenceNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    return paginate(this.prisma.inspectionPlan, {
      where,
      include: {
        contact: { select: contactSelect },
        assignedUser: { select: userSelect },
        reviewer: { select: userSelect },
      },
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    // Org-scoping zit in de query zelf: een plan van een andere org valt buiten
    // het filter en geeft een 404 (net als assets/findings) i.p.v. een 403 — zo
    // lekken we niet het bestaan van andermans data. SUPERUSER (orgId null)
    // krijgt {} van orgScope en ziet dus alle organisaties.
    return assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        include: {
          contact: { select: contactSelect },
          project: { select: { id: true, title: true, projectNumber: true } },
          assignedUser: { select: userSelect },
          reviewer: { select: userSelect },
          inspectionTemplate: {
            select: { id: true, name: true, code: true, version: true },
          },
        },
      }),
      'Inspectieplan',
    );
  }

  async create(dto: CreateInspectionPlanDto, user: User) {
    const orgId = requireOrg(user);

    // Cross-tenant FK-validatie vóór de schrijfactie — alle checks zijn
    // onafhankelijke reads die throwen bij falen, dus parallel uitvoeren.
    await Promise.all([
      assertSameOrg(this.prisma.contact, dto.contactId, orgId, 'Relatie'),
      assertSameOrg(this.prisma.project, dto.projectId, orgId, 'Project'),
      assertSameOrg(this.prisma.user, dto.assignedTo, orgId, 'Inspecteur'),
      assertSameOrg(this.prisma.user, dto.reviewerId, orgId, 'Reviewer'),
      assertSameOrg(this.prisma.contactPerson, dto.installationResponsibleId, orgId, 'Installatieverantwoordelijke'),
      this.assertTemplateUsable(dto.inspectionTemplateId, orgId),
      this.assertNormExists(dto.normTypeCode),
      this.assertLookup(LOOKUP_KIND.INSPECTION_TYPES, dto.inspectionTypeCode, orgId),
    ]);

    const plan = await this.prisma.inspectionPlan.create({
      data: {
        orgId,
        contactId: dto.contactId,
        projectId: dto.projectId ?? null,
        inspectionTemplateId: dto.inspectionTemplateId ?? null,
        projectName: dto.projectName,
        description: dto.description ?? null,
        referenceNumber: dto.referenceNumber ?? null,
        normTypeCode: dto.normTypeCode,
        inspectionTypeCode: dto.inspectionTypeCode ?? 'initial',
        statusCode: STATUS_DRAFT,
        addressStreet: dto.addressStreet ?? null,
        addressHouseNumber: dto.addressHouseNumber ?? null,
        addressPostalCode: dto.addressPostalCode ?? null,
        addressCity: dto.addressCity ?? null,
        gpsLatitude: dto.gpsLatitude ?? null,
        gpsLongitude: dto.gpsLongitude ?? null,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        assignedTo: dto.assignedTo ?? null,
        reviewerId: dto.reviewerId ?? null,
        installationResponsibleId: dto.installationResponsibleId ?? null,
        notes: dto.notes ?? null,
        createdBy: user.id,
      },
    });

    // Notify de toegewezen inspecteur (tenzij dat de aanmaker zelf is)
    if (plan.assignedTo && plan.assignedTo !== user.id) {
      this.notify(NotificationType.INSPECTIEPLAN_TOEGEWEZEN, plan, [
        plan.assignedTo,
      ]);
    }

    return plan;
  }

  async update(id: string, dto: UpdateInspectionPlanDto, user: User) {
    const existing = await this.findOne(id, user);
    const orgId = existing.orgId;
    const oldAssignedTo = existing.assignedTo;

    // Onafhankelijke validaties parallel (zie create()).
    await Promise.all([
      assertSameOrg(this.prisma.contact, dto.contactId, orgId, 'Relatie'),
      assertSameOrg(this.prisma.project, dto.projectId, orgId, 'Project'),
      assertSameOrg(this.prisma.user, dto.assignedTo, orgId, 'Inspecteur'),
      assertSameOrg(this.prisma.user, dto.reviewerId, orgId, 'Reviewer'),
      assertSameOrg(this.prisma.contactPerson, dto.installationResponsibleId, orgId, 'Installatieverantwoordelijke'),
      this.assertTemplateUsable(dto.inspectionTemplateId, orgId),
      dto.normTypeCode ? this.assertNormExists(dto.normTypeCode) : Promise.resolve(),
      this.assertLookup(LOOKUP_KIND.INSPECTION_TYPES, dto.inspectionTypeCode, orgId),
    ]);

    const data: Prisma.InspectionPlanUpdateInput = {};
    // Map alleen aanwezige velden (PATCH-semantiek).
    if (dto.projectName !== undefined) data.projectName = dto.projectName;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.referenceNumber !== undefined)
      data.referenceNumber = dto.referenceNumber ?? null;
    if (dto.normTypeCode !== undefined) data.normTypeCode = dto.normTypeCode;
    if (dto.inspectionTypeCode !== undefined)
      data.inspectionTypeCode = dto.inspectionTypeCode;
    if (dto.plannedDate !== undefined)
      data.plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : null;
    if (dto.deadline !== undefined)
      data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.contactId !== undefined)
      data.contact = { connect: { id: dto.contactId } };
    if (dto.projectId !== undefined)
      data.project = dto.projectId
        ? { connect: { id: dto.projectId } }
        : { disconnect: true };
    if (dto.assignedTo !== undefined)
      data.assignedUser = dto.assignedTo
        ? { connect: { id: dto.assignedTo } }
        : { disconnect: true };
    if (dto.reviewerId !== undefined)
      data.reviewer = dto.reviewerId
        ? { connect: { id: dto.reviewerId } }
        : { disconnect: true };

    // OVERRIDE: statusCode mag via update gezet worden (mirror originele Inspexi-App).
    // Vereist om een plan naar `in_progress` te brengen. Validatie via lookup.
    if (dto.statusCode !== undefined) {
      const row = await this.lookups.resolveLookup(
        LOOKUP_KIND.PLAN_STATUS_TYPES,
        dto.statusCode,
        orgId,
      );
      if (!row) {
        throw new BadRequestException(`Onbekende planstatus: ${dto.statusCode}`);
      }
      data.statusCode = dto.statusCode;
    }
    if (dto.startedAt !== undefined)
      data.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    if (dto.internalNotes !== undefined)
      data.internalNotes = dto.internalNotes ?? null;
    if (dto.metadata !== undefined)
      data.metadata = dto.metadata as Prisma.InputJsonValue;

    data.lastModifiedByUser = { connect: { id: user.id } };

    const plan = await this.prisma.inspectionPlan.update({
      where: { id: existing.id },
      data,
    });

    // Notify bij wijziging van de toegewezen inspecteur (tenzij naar de aanmaker zelf).
    if (
      dto.assignedTo &&
      dto.assignedTo !== oldAssignedTo &&
      dto.assignedTo !== user.id
    ) {
      this.notify(NotificationType.INSPECTIEPLAN_TOEGEWEZEN, plan, [
        dto.assignedTo,
      ]);
    }

    return plan;
  }

  /**
   * OVERRIDE (mirror originele Inspexi-App): inspecteur dient in ter review.
   * Alleen plannen die `in_progress` zijn mogen ingediend worden.
   */
  async submit(id: string, dto: SubmitInspectionPlanDto, user: User) {
    const plan = await this.findOne(id, user);
    if (plan.statusCode !== STATUS_IN_PROGRESS) {
      throw new BadRequestException(
        'Alleen plannen die in uitvoering zijn kunnen ter review ingediend worden',
      );
    }

    if (dto.reviewerId) {
      await assertSameOrg(
        this.prisma.user,
        dto.reviewerId,
        plan.orgId,
        'Reviewer',
      );
    }
    const reviewerId = dto.reviewerId ?? plan.reviewerId;

    const updated = await this.prisma.inspectionPlan.update({
      where: { id: plan.id },
      data: {
        statusCode: STATUS_PENDING_REVIEW,
        submittedAt: new Date(),
        reviewer: reviewerId ? { connect: { id: reviewerId } } : undefined,
        internalNotes: dto.notes
          ? `${plan.internalNotes ?? ''}\n\nSubmit notes: ${dto.notes}`
          : plan.internalNotes,
        lastModifiedByUser: { connect: { id: user.id } },
      },
    });

    if (reviewerId && reviewerId !== user.id) {
      this.notify(NotificationType.INSPECTIEPLAN_TER_REVIEW, updated, [
        reviewerId,
      ]);
    }

    return updated;
  }

  /**
   * OVERRIDE (mirror originele Inspexi-App): reviewer keurt goed/af.
   * Alleen plannen `pending_review` kunnen beoordeeld worden. Afkeuren →
   * `reviewed` (NIET terug naar in_progress).
   */
  async review(id: string, dto: ReviewInspectionPlanDto, user: User) {
    const plan = await this.findOne(id, user);
    if (plan.statusCode !== STATUS_PENDING_REVIEW) {
      throw new BadRequestException(
        'Alleen plannen in review kunnen beoordeeld worden',
      );
    }

    const approved = dto.decision === 'approve';
    const newStatus = approved ? STATUS_APPROVED : STATUS_REVIEWED;

    const updated = await this.prisma.inspectionPlan.update({
      where: { id: plan.id },
      data: {
        statusCode: newStatus,
        reviewedAt: new Date(),
        approvedAt: approved ? new Date() : undefined,
        internalNotes: dto.notes
          ? `${plan.internalNotes ?? ''}\n\nReview notes: ${dto.notes}`
          : plan.internalNotes,
        lastModifiedByUser: { connect: { id: user.id } },
      },
    });

    const recipients = [
      ...new Set([plan.assignedTo, plan.createdBy].filter(Boolean) as string[]),
    ].filter((recipientId) => recipientId !== user.id);

    this.notify(
      approved
        ? NotificationType.INSPECTIEPLAN_GOEDGEKEURD
        : NotificationType.INSPECTIEPLAN_AFGEKEURD,
      updated,
      recipients,
    );

    return updated;
  }

  /** Soft-delete via deletedAt (tombstone voor sync). */
  async remove(id: string, user: User) {
    const plan = await this.findOne(id, user);
    await this.prisma.inspectionPlan.update({
      where: { id: plan.id },
      data: { deletedAt: new Date() },
    });
  }
}
