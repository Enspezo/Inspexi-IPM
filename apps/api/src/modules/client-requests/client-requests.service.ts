// Klant-verzoeken (herinspectie / nieuwe opdracht). ClientRequest is org-gescoped: orgId komt
// ALTIJD uit @CurrentTenant (subdomein), NOOIT uit de body. Contact-scope via ClientAccess.
// Geport uit ../Inspexi-App/.../client-requests, aangepast aan het Beheer-schema
// (Contact i.p.v. Client; requestTypeCode/statusCode).
//
// NB: backoffice-notificaties bij een nieuw verzoek zijn een open punt (FASE6 §8 — vereist
// nieuwe NotificationType-waarden via aparte migratie) en bewust nog niet gekoppeld.

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { ReinspectionRequestDto, NewAssignmentRequestDto } from './dto';

const REQUEST_INCLUDE = {
  contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
  relatedInspectionPlan: { select: { id: true, projectName: true, addressCity: true } },
} as const;

@Injectable()
export class ClientRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inspections: ClientInspectionsService,
  ) {}

  async list(user: CurrentClientUserData, orgId: string | null) {
    const org = this.inspections.requireOrg(orgId);
    const contactIds = await this.inspections.accessibleContactIds(user.id, org);
    if (contactIds.length === 0) return [];
    return this.prisma.clientRequest.findMany({
      where: { orgId: org, contactId: { in: contactIds } },
      orderBy: { createdAt: 'desc' },
      include: REQUEST_INCLUDE,
    });
  }

  async getOne(user: CurrentClientUserData, orgId: string | null, id: string) {
    const org = this.inspections.requireOrg(orgId);
    const contactIds = await this.inspections.accessibleContactIds(user.id, org);
    const request = contactIds.length
      ? await this.prisma.clientRequest.findFirst({
          where: { id, orgId: org, contactId: { in: contactIds } },
          include: REQUEST_INCLUDE,
        })
      : null;
    if (!request) throw new NotFoundException('Verzoek niet gevonden');
    return request;
  }

  async createReinspection(user: CurrentClientUserData, orgId: string | null, dto: ReinspectionRequestDto) {
    const org = this.inspections.requireOrg(orgId);

    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id: dto.inspectionPlanId, orgId: org, deletedAt: null },
      select: { id: true, contactId: true, projectName: true },
    });
    if (!plan) throw new NotFoundException('Inspectie niet gevonden');
    await this.inspections.assertInspectionAccess(user.id, org, plan.id);

    return this.prisma.clientRequest.create({
      data: {
        orgId: org,
        contactId: plan.contactId,
        clientUserId: user.id,
        requestTypeCode: 'REINSPECTION',
        relatedInspectionPlanId: plan.id,
        subject: `Herinspectie - ${plan.projectName}`,
        description: dto.description,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        statusCode: 'PENDING_REQUEST',
      },
      include: REQUEST_INCLUDE,
    });
  }

  async createNewAssignment(
    user: CurrentClientUserData,
    orgId: string | null,
    dto: NewAssignmentRequestDto,
  ) {
    const org = this.inspections.requireOrg(orgId);
    const contactIds = await this.inspections.accessibleContactIds(user.id, org);
    if (!contactIds.includes(dto.contactId)) {
      throw new ForbiddenException('Geen toegang tot dit contact');
    }

    return this.prisma.clientRequest.create({
      data: {
        orgId: org,
        contactId: dto.contactId,
        clientUserId: user.id,
        requestTypeCode: 'NEW_ASSIGNMENT',
        subject: dto.subject,
        description: dto.description,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        statusCode: 'PENDING_REQUEST',
      },
      include: REQUEST_INCLUDE,
    });
  }
}
