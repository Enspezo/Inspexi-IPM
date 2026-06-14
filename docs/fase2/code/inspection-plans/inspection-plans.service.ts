// Doel in apps/api: src/modules/inspection-plans/inspection-plans.service.ts
//
// GOLDEN PATH voor het uitvoeringsdomein. Demonstreert alle Fase 2-conventies:
//  - orgScope() + verplichte, gedenormaliseerde orgId
//  - assertSameOrg() op elke externe FK (contact, project, user, contactPerson)
//  - org-OF-systeem check voor template-FK (orgId null = systeemtemplate)
//  - LookupService voor *Code-velden (statusCode/inspectionTypeCode) — Fase 1 lookups
//  - status-transities vergelijken SYSTEEMCODES (niet labels) — zie FASE1 §3a
//  - soft-delete via deletedAt (sync-tombstone) i.p.v. isDeleted
//  - paginate() + buildOrderBy()
//
// NB: dit is de conventie-correcte skelet-port; verifieer de exacte
// business-regels (welke statusovergangen, welke notificaties) tegen de
// originele Inspexi-App service voordat je 'm definitief maakt.

import {
  Injectable, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  paginate, buildOrderBy, orgScope, assertFound, assertSameOrg,
} from '@/common';
import { LookupService } from '../lookups/lookup.service';
import {
  CreateInspectionPlanDto, UpdateInspectionPlanDto,
  ListInspectionPlansQueryDto, ReviewInspectionPlanDto,
} from './dto';

// Beschermde systeemcodes die de state-machine stuurt (orgs mogen herlabelen, niet verwijderen).
const STATUS_DRAFT = 'draft';
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_PENDING_REVIEW = 'pending_review';
const STATUS_APPROVED = 'approved';
const SUBMITTABLE = new Set([STATUS_DRAFT, 'planned', STATUS_IN_PROGRESS]);

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const contactSelect = { id: true, companyName: true, firstName: true, lastName: true };

@Injectable()
export class InspectionPlansService {
  constructor(
    private prisma: PrismaService,
    private lookups: LookupService,
  ) {}

  /** Inspectieplannen horen altijd bij een org; superuser moet binnen een org-context werken. */
  private requireOrg(user: User): string {
    if (!user.orgId) {
      throw new BadRequestException('Selecteer eerst een organisatie');
    }
    return user.orgId;
  }

  /** Template mag een systeemtemplate (orgId null) of een eigen-org template zijn. */
  private async assertTemplateUsable(id: string | undefined, orgId: string): Promise<void> {
    if (!id) return;
    const tpl = await this.prisma.inspectionTemplate.findUnique({
      where: { id }, select: { orgId: true },
    });
    if (!tpl) throw new BadRequestException('Inspectie-template niet gevonden');
    if (tpl.orgId !== null && tpl.orgId !== orgId) {
      throw new ForbiddenException('Template hoort niet bij uw organisatie');
    }
  }

  private async assertNormExists(code: string): Promise<void> {
    const norm = await this.prisma.normTypeDefinition.findUnique({
      where: { code }, select: { isActive: true },
    });
    if (!norm || !norm.isActive) {
      throw new BadRequestException(`Onbekende of inactieve norm: ${code}`);
    }
  }

  private async assertLookup(kind: any, code: string | undefined, orgId: string): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup(kind, code, orgId);
    if (!row) throw new BadRequestException(`Onbekende waarde "${code}" voor ${kind}`);
  }

  async findAll(user: User, query: ListInspectionPlansQueryDto) {
    const { search, statusCode, contactId, onlyMine, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const orderBy = buildOrderBy(sortBy, sortOrder,
      ['projectName', 'statusCode', 'plannedDate', 'deadline', 'createdAt'],
      { createdAt: 'desc' });

    const where: Prisma.InspectionPlanWhereInput = { ...orgScope(user), deletedAt: null };
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
      orderBy, page, limit,
    });
  }

  async findOne(id: string, user: User) {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id, deletedAt: null },
        include: {
          contact: { select: contactSelect },
          project: { select: { id: true, title: true, projectNumber: true } },
          assignedUser: { select: userSelect },
          reviewer: { select: userSelect },
          inspectionTemplate: { select: { id: true, name: true, code: true, version: true } },
        },
      }),
      'Inspectieplan',
    );
    if (!user.roles.includes(Role.SUPERUSER) && plan.orgId !== user.orgId) {
      throw new ForbiddenException('Geen toegang tot dit inspectieplan');
    }
    return plan;
  }

  async create(dto: CreateInspectionPlanDto, user: User) {
    const orgId = this.requireOrg(user);

    // Cross-tenant FK-validatie vóór de schrijfactie
    await assertSameOrg(this.prisma.contact, dto.contactId, orgId, 'Relatie');
    await assertSameOrg(this.prisma.project, dto.projectId, orgId, 'Project');
    await assertSameOrg(this.prisma.user, dto.assignedTo, orgId, 'Inspecteur');
    await assertSameOrg(this.prisma.user, dto.reviewerId, orgId, 'Reviewer');
    await assertSameOrg(this.prisma.contactPerson, dto.installationResponsibleId, orgId, 'Installatieverantwoordelijke');
    await this.assertTemplateUsable(dto.inspectionTemplateId, orgId);
    await this.assertNormExists(dto.normTypeCode);
    await this.assertLookup('inspection-types', dto.inspectionTypeCode, orgId);

    return this.prisma.inspectionPlan.create({
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
  }

  async update(id: string, dto: UpdateInspectionPlanDto, user: User) {
    const existing = await this.findOne(id, user);
    const orgId = existing.orgId;

    await assertSameOrg(this.prisma.contact, dto.contactId, orgId, 'Relatie');
    await assertSameOrg(this.prisma.project, dto.projectId, orgId, 'Project');
    await assertSameOrg(this.prisma.user, dto.assignedTo, orgId, 'Inspecteur');
    await assertSameOrg(this.prisma.user, dto.reviewerId, orgId, 'Reviewer');
    await assertSameOrg(this.prisma.contactPerson, dto.installationResponsibleId, orgId, 'Installatieverantwoordelijke');
    await this.assertTemplateUsable(dto.inspectionTemplateId, orgId);
    if (dto.normTypeCode) await this.assertNormExists(dto.normTypeCode);
    await this.assertLookup('inspection-types', dto.inspectionTypeCode, orgId);

    const data: Prisma.InspectionPlanUpdateInput = {};
    // Map alleen aanwezige velden (PATCH-semantiek); statusCode blijft buiten update.
    if (dto.projectName !== undefined) data.projectName = dto.projectName;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber ?? null;
    if (dto.normTypeCode !== undefined) data.normTypeCode = dto.normTypeCode;
    if (dto.inspectionTypeCode !== undefined) data.inspectionTypeCode = dto.inspectionTypeCode;
    if (dto.plannedDate !== undefined) data.plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : null;
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.contactId !== undefined) data.contact = { connect: { id: dto.contactId } };
    if (dto.projectId !== undefined) data.project = dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true };
    if (dto.assignedTo !== undefined) data.assignedUser = dto.assignedTo ? { connect: { id: dto.assignedTo } } : { disconnect: true };
    if (dto.reviewerId !== undefined) data.reviewer = dto.reviewerId ? { connect: { id: dto.reviewerId } } : { disconnect: true };
    data.lastModifiedByUser = { connect: { id: user.id } };

    return this.prisma.inspectionPlan.update({ where: { id: existing.id }, data });
  }

  /** Inspecteur dient in ter review: <submittable> → pending_review. */
  async submit(id: string, user: User) {
    const plan = await this.findOne(id, user);
    if (!SUBMITTABLE.has(plan.statusCode)) {
      throw new BadRequestException(`Inspectieplan kan niet ingediend worden vanuit status "${plan.statusCode}"`);
    }
    return this.prisma.inspectionPlan.update({
      where: { id: plan.id },
      data: { statusCode: STATUS_PENDING_REVIEW, submittedAt: new Date(), lastModifiedByUser: { connect: { id: user.id } } },
    });
  }

  /** Reviewer keurt goed/af: pending_review → approved | terug naar in_progress. */
  async review(id: string, dto: ReviewInspectionPlanDto, user: User) {
    const plan = await this.findOne(id, user);
    if (plan.statusCode !== STATUS_PENDING_REVIEW) {
      throw new BadRequestException('Alleen plannen in review kunnen beoordeeld worden');
    }
    const approved = dto.decision === 'approve';
    return this.prisma.inspectionPlan.update({
      where: { id: plan.id },
      data: {
        statusCode: approved ? STATUS_APPROVED : STATUS_IN_PROGRESS,
        reviewedAt: new Date(),
        approvedAt: approved ? new Date() : null,
        internalNotes: dto.notes ?? plan.internalNotes,
        reviewer: { connect: { id: user.id } },
      },
    });
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
