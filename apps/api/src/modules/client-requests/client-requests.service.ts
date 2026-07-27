// Klant-verzoeken (herinspectie / nieuwe opdracht). ClientRequest is org-gescoped: orgId komt
// ALTIJD uit @CurrentTenant (subdomein), NOOIT uit de body. Contact-scope via ClientAccess.
// Geport uit ../Inspexi-App/.../client-requests, aangepast aan het Beheer-schema
// (Contact i.p.v. Client; requestTypeCode/statusCode).
//
// NB: in-app backoffice-notificaties bij een nieuw verzoek blijven een open punt (FASE6 §8 —
// vereist nieuwe NotificationType-waarden via aparte migratie; stafzijde = Epic 2 in
// docs/herstelplan/03-beslispunten-backlog.md §C). WP-B9-mitigatie (B-403): tot die tijd
// krijgt de organisatie bij élk nieuw verzoek een directe e-mail (fire-and-forget),
// zodat er geen aanvraag stilletjes verdwijnt.

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ClientRequest, Contact, InspectionPlan } from '@prisma/client';
import { PrismaService } from '@/prisma';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { ClientRequestEmailService } from './client-request-email.service';
import { ReinspectionRequestDto, NewAssignmentRequestDto } from './dto';

const REQUEST_INCLUDE = {
  contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
  relatedInspectionPlan: { select: { id: true, projectName: true, addressCity: true } },
} as const;

/** Rollen die de verzoek-e-mail ontvangen (B-403): wie aanvragen afhandelt. */
const REQUEST_NOTICE_ROLES = [Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const REQUEST_TYPE_LABELS: Record<string, string> = {
  REINSPECTION: 'Herinspectie',
  NEW_ASSIGNMENT: 'Nieuwe opdracht',
};

type CreatedClientRequest = ClientRequest & {
  contact: Pick<Contact, 'id' | 'companyName' | 'firstName' | 'lastName'> | null;
  relatedInspectionPlan: Pick<InspectionPlan, 'id' | 'projectName' | 'addressCity'> | null;
};

@Injectable()
export class ClientRequestsService {
  private readonly logger = new Logger(ClientRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspections: ClientInspectionsService,
    private readonly email: ClientRequestEmailService,
  ) {}

  /**
   * B-403-mitigatie: directe e-mail naar de organisatie bij een nieuw verzoek.
   * Ontvangers = actieve stafgebruikers met ORG_ADMIN/MANAGER/BACKOFFICE (de
   * rollen die aanvragen afhandelen); geen ontvangers → alleen Logger.warn.
   * Fire-and-forget: mag de klant-flow nooit laten falen.
   */
  async notifyOrganization(user: CurrentClientUserData, request: CreatedClientRequest): Promise<void> {
    try {
      const [recipients, org] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            orgId: request.orgId,
            isActive: true,
            isDeleted: false,
            roles: { hasSome: REQUEST_NOTICE_ROLES },
          },
          select: { email: true },
        }),
        this.prisma.organization.findUnique({
          where: { id: request.orgId },
          select: { name: true },
        }),
      ]);
      const to = [...new Set(recipients.map((r) => r.email))];
      if (to.length === 0) {
        this.logger.warn(
          `Geen ORG_ADMIN/MANAGER/BACKOFFICE-ontvangers voor org ${request.orgId} — verzoek-e-mail overgeslagen (verzoek ${request.id})`,
        );
        return;
      }
      const c = request.contact;
      await this.email.sendNewRequestNotice({
        to,
        orgName: org?.name ?? 'InspeXi',
        requestTypeLabel: REQUEST_TYPE_LABELS[request.requestTypeCode] ?? request.requestTypeCode,
        subject: request.subject,
        description: request.description,
        preferredDate: request.preferredDate,
        contactName: c
          ? c.companyName ?? ([c.firstName, c.lastName].filter(Boolean).join(' ') || null)
          : null,
        clientUserName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        relatedProjectName: request.relatedInspectionPlan?.projectName ?? null,
      });
    } catch (error) {
      this.logger.error(`Verzoek-e-mail voor verzoek ${request.id} mislukt`, error);
    }
  }

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

    const request = await this.prisma.clientRequest.create({
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
    void this.notifyOrganization(user, request);
    return request;
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

    const request = await this.prisma.clientRequest.create({
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
    void this.notifyOrganization(user, request);
    return request;
  }
}
