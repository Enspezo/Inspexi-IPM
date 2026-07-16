import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { User, Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  paginate,
  buildOrderBy,
  orgScope,
  assertFound,
  assertSameOrg,
  resolvePhaseLink,
  PROJECT_FASEN_FEATURE,
  PROJECT_FASEN_REQUIRED_MESSAGE,
  requireOrg,
  validateJsonColumn,
  STATUS_DRAFT,
  STATUS_IN_PROGRESS,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
} from '@/common';
import { planMetadataSchema, PLAN_METADATA_LABEL } from './schemas/plan-metadata.schema';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { LookupService, LOOKUP_KIND, type LookupKind } from '../lookups/lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiReviewService } from '../ai-review/ai-review.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { CreateAssetNodeDto } from '../asset-nodes/dto';
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
  private readonly logger = new Logger(InspectionPlansService.name);

  constructor(
    private prisma: PrismaService,
    private lookups: LookupService,
    private notifications: NotificationsService,
    private assetNodes: AssetNodesService,
    private entitlements: EntitlementsService,
    private aiReview: AiReviewService,
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
        projectPhase: { select: { id: true, name: true, sortOrder: true, status: true } },
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
          projectPhase: { select: { id: true, name: true, sortOrder: true, status: true } },
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
      assertSameOrg(this.prisma.location, dto.locationId, orgId, 'Hoofdlocatie'),
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
        locationId: dto.locationId ?? null,
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

    // Werkboom: maak de wortel-LOCATION-node lazily aan + zet scope-deellocaties.
    if (plan.locationId) {
      await this.assetNodes.ensureRootNode(plan.locationId, user);
      if (dto.scopeLocationIds?.length) {
        await this.replaceScopeLocations(plan.id, orgId, plan.locationId, dto.scopeLocationIds);
      }
    } else if (dto.scopeLocationIds?.length) {
      throw new BadRequestException('scopeLocationIds vereist een hoofdlocatie (locationId)');
    }

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
      assertSameOrg(this.prisma.location, dto.locationId, orgId, 'Hoofdlocatie'),
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

    // Projectfase-koppeling (PRD-12): valideer org + projectconsistentie t.o.v. het
    // effectieve project (een in dezelfde PATCH gewijzigd projectId telt mee) en
    // cascadeer het project van de fase wanneer het plan er nog geen heeft.
    const effectiveProjectId =
      dto.projectId !== undefined ? dto.projectId : existing.projectId;
    // Alleen bij een DAADWERKELIJKE wijziging van projectPhaseId de
    // PROJECT_FASEN-entitlement afdwingen (§Fase E).
    if (dto.projectPhaseId !== undefined) {
      await this.entitlements.assertFeature(
        orgId, PROJECT_FASEN_FEATURE, PROJECT_FASEN_REQUIRED_MESSAGE,
      );
    }
    const phaseLink = await resolvePhaseLink(
      this.prisma.projectPhase, dto.projectPhaseId, orgId, effectiveProjectId,
    );
    if (phaseLink !== undefined) {
      data.projectPhase = phaseLink.phaseId
        ? { connect: { id: phaseLink.phaseId } }
        : { disconnect: true };
      if (phaseLink.projectId && effectiveProjectId == null) {
        data.project = { connect: { id: phaseLink.projectId } };
      }
    }
    if (dto.locationId !== undefined)
      data.location = dto.locationId
        ? { connect: { id: dto.locationId } }
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
      // Vier-ogen-gate (PRD-13 §13.3 besluit 5): met de org-toggle aan mag een
      // plan pas naar completed/approved als er een menselijke review is geweest.
      // De org-query draait alleen op deze (zeldzame) transitie, niet per request;
      // de /sync-push van de PWA loopt niet via update() en blijft ongemoeid.
      if (
        (dto.statusCode === STATUS_COMPLETED || dto.statusCode === STATUS_APPROVED) &&
        !existing.reviewedAt
      ) {
        const org = await this.prisma.organization.findUnique({
          where: { id: orgId },
          select: { inspectionReviewEnabled: true },
        });
        if (org?.inspectionReviewEnabled) {
          throw new BadRequestException(
            'Dit plan moet eerst beoordeeld worden (vier-ogen-principe)',
          );
        }
      }
      data.statusCode = dto.statusCode;
    }
    if (dto.startedAt !== undefined)
      data.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    if (dto.internalNotes !== undefined)
      data.internalNotes = dto.internalNotes ?? null;
    if (dto.metadata !== undefined) {
      validateJsonColumn(planMetadataSchema, dto.metadata, PLAN_METADATA_LABEL);
      data.metadata = dto.metadata as Prisma.InputJsonValue;
    }

    data.lastModifiedByUser = { connect: { id: user.id } };

    const plan = await this.prisma.inspectionPlan.update({
      where: { id: existing.id },
      data,
    });

    // Werkboom + scope-deellocaties bijhouden.
    const effectiveLocationId =
      dto.locationId !== undefined ? dto.locationId : existing.locationId;
    if (dto.locationId) {
      await this.assetNodes.ensureRootNode(dto.locationId, user);
    }
    if (dto.scopeLocationIds !== undefined) {
      if (!effectiveLocationId) {
        throw new BadRequestException('scopeLocationIds vereist een hoofdlocatie (locationId)');
      }
      await this.replaceScopeLocations(plan.id, orgId, effectiveLocationId, dto.scopeLocationIds);
    } else if (dto.locationId !== undefined && dto.locationId !== existing.locationId) {
      // Hoofdlocatie gewijzigd → bestaande scope-deellocaties horen bij de oude boom.
      await this.prisma.inspectionPlanLocation.deleteMany({
        where: { inspectionPlanId: plan.id },
      });
    }

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

    // AI-voorcontrole (PRD-13 §13.3 besluit 2): fire-and-forget; de guard-checks
    // (AI_REVIEW-entitlement, org-toggle, API-key, concurrency) zitten in
    // startRun zelf. Een geweigerde of mislukte start mag de submit nooit raken.
    this.aiReview.startRun(updated.id, user).catch((e) => {
      if (e instanceof HttpException) {
        this.logger.debug(`AI-review niet gestart voor plan ${updated.id}: ${e.message}`);
      } else {
        this.logger.error(`AI-review starten mislukt voor plan ${updated.id}: ${e?.message}`, e?.stack);
      }
    });

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

  // ─── Scope-deellocaties (InspectionPlanLocation) ───────────

  /**
   * Vervangt de volledige scope-set van een plan. Valideert elke node
   * (LOCATION + in de boom van `locationId`) vóór het schrijven. De eerste node
   * wordt als `isPrimary` gemarkeerd.
   */
  private async replaceScopeLocations(
    planId: string,
    orgId: string,
    locationId: string,
    assetNodeIds: string[],
  ): Promise<void> {
    for (const assetNodeId of assetNodeIds) {
      await this.assetNodes.assertValidScopeLocation(assetNodeId, locationId, orgId);
    }
    await this.prisma.$transaction([
      this.prisma.inspectionPlanLocation.deleteMany({
        where: { inspectionPlanId: planId },
      }),
      ...assetNodeIds.map((assetNodeId, index) =>
        this.prisma.inspectionPlanLocation.create({
          data: {
            orgId,
            inspectionPlanId: planId,
            assetNodeId,
            isPrimary: index === 0,
          },
        }),
      ),
    ]);
  }

  /** Lijst van scope-deellocaties van een plan. */
  async listScopeLocations(planId: string, user: User) {
    await this.findOne(planId, user);
    return this.prisma.inspectionPlanLocation.findMany({
      where: { inspectionPlanId: planId },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /** Voegt één deellocatie toe aan de scope (idempotent). */
  async addScopeLocation(planId: string, assetNodeId: string, user: User) {
    const plan = await this.findOne(planId, user);
    if (!plan.locationId) {
      throw new BadRequestException('Het inspectieplan heeft geen hoofdlocatie (locationId)');
    }
    await this.assetNodes.assertValidScopeLocation(assetNodeId, plan.locationId, plan.orgId);

    const existingCount = await this.prisma.inspectionPlanLocation.count({
      where: { inspectionPlanId: planId },
    });
    await this.prisma.inspectionPlanLocation.upsert({
      where: { inspectionPlanId_assetNodeId: { inspectionPlanId: planId, assetNodeId } },
      create: {
        orgId: plan.orgId,
        inspectionPlanId: planId,
        assetNodeId,
        isPrimary: existingCount === 0,
      },
      update: {},
    });
    return this.listScopeLocations(planId, user);
  }

  /** Verwijdert één deellocatie uit de scope. */
  async removeScopeLocation(planId: string, assetNodeId: string, user: User) {
    await this.findOne(planId, user);
    await this.prisma.inspectionPlanLocation.deleteMany({
      where: { inspectionPlanId: planId, assetNodeId },
    });
    return this.listScopeLocations(planId, user);
  }

  /**
   * Maakt een asset-node "vanuit een inspectie" aan: zonder expliciete parent
   * defaultet de parent naar de enige scope-deellocatie (of de wortel-LOCATION)
   * — de caller mag dit altijd overrulen door `parentId` mee te geven.
   */
  async createAssetNodeFromPlan(
    planId: string,
    user: User,
    dto: CreateAssetNodeDto,
    deviceId?: string,
  ) {
    await this.findOne(planId, user); // org-scope + bestaan (404)
    const parentId =
      dto.parentId ?? (await this.assetNodes.resolveDefaultParentForPlan(planId, user));
    return this.assetNodes.create(user, { ...dto, parentId }, deviceId);
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
