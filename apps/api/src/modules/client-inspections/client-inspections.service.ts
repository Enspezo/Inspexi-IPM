// KLANT-data-scoping onder subdomein-tenancy. Een klant ziet alleen:
//   - inspectieplannen van Contacten in DEZE org waar hij ClientAccess op heeft, OF
//   - plannen waarop hij expliciete InspectionClientAccess (canView) heeft.
// orgId komt uit het subdomein (@CurrentTenant) — NOOIT uit het token. Dit patroon
// (accessScope/hasAccessToInspection) wordt hergebruikt door client-documents/-findings/
// -messages/-requests. Geport uit ../Inspexi-App/.../client-inspections, aangepast aan het
// Beheer-schema (Contact i.p.v. Client; statusCode/inspectionTypeCode; shortDescription).

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SignatureStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  STATUS_OPEN,
  STATUS_RESOLVED,
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
  resolveInspectorContact,
} from '@/common';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';

/**
 * B-412 (WP-B9): planstatussen waarvan de INHOUD (constateringen + documenten)
 * klant-zichtbaar is. Metadata (titel, adres, datum, status) is altijd zichtbaar;
 * inhoud pas vanaf review. De vier-ogen-gate op statusovergangen
 * (inspection-plans.service / sync.service) garandeert dat completed/approved
 * alleen ná review bereikt worden zolang de org-toggle aan staat.
 */
export const CLIENT_CONTENT_RELEASED_STATUSES: readonly string[] = [
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
];

@Injectable()
export class ClientInspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  requireOrg(orgId: string | null): string {
    if (!orgId) throw new BadRequestException('Gebruik het subdomein van uw organisatie');
    return orgId;
  }

  /** Contact-ids in deze org waar de klant ClientAccess op heeft. */
  async accessibleContactIds(clientUserId: string, orgId: string): Promise<string[]> {
    const rows = await this.prisma.clientAccess.findMany({
      where: { clientUserId, contact: { orgId, isDeleted: false } },
      select: { contactId: true },
    });
    return rows.map((r) => r.contactId);
  }

  /** Plan-ids met expliciete InspectionClientAccess (canView) binnen deze org. */
  private async explicitPlanIds(clientUserId: string, orgId: string): Promise<string[]> {
    const rows = await this.prisma.inspectionClientAccess.findMany({
      where: { clientUserId, canView: true, inspectionPlan: { orgId } },
      select: { inspectionPlanId: true },
    });
    return rows.map((r) => r.inspectionPlanId);
  }

  private async accessScope(clientUserId: string, orgId: string) {
    const [contactIds, planIds] = await Promise.all([
      this.accessibleContactIds(clientUserId, orgId),
      this.explicitPlanIds(clientUserId, orgId),
    ]);
    return { contactIds, planIds };
  }

  /** OR-filter voor toegankelijke plannen; geen toegang → null. */
  private scopeOr(contactIds: string[], planIds: string[]) {
    const or = [
      ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
      ...(planIds.length ? [{ id: { in: planIds } }] : []),
    ];
    return or.length ? or : null;
  }

  /** Heeft de klant toegang tot dit plan binnen deze org? (org uit subdomein) */
  async hasAccessToInspection(
    clientUserId: string,
    orgId: string,
    planId: string,
  ): Promise<boolean> {
    const { contactIds, planIds } = await this.accessScope(clientUserId, orgId);
    const or = this.scopeOr(contactIds, planIds);
    if (!or) return false;
    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id: planId, orgId, deletedAt: null, OR: or },
      select: { id: true },
    });
    return !!plan;
  }

  /** 403 als de klant geen toegang heeft (hergebruikt door sub-services). */
  async assertInspectionAccess(clientUserId: string, orgId: string, planId: string): Promise<void> {
    if (!(await this.hasAccessToInspection(clientUserId, orgId, planId))) {
      throw new ForbiddenException('Geen toegang tot deze inspectie');
    }
  }

  /**
   * 403 wanneer de klant geen ONDERTEKEN-recht heeft op dit plan (SEC-11). Signing
   * vereist een expliciete InspectionClientAccess-grant met canSign=true — het
   * magic-link-pad zet die altijd, maar een staf-aangemaakte view-only grant
   * (canSign=false) of louter contact-niveau-toegang mag niet ondertekenen.
   */
  async assertSignAccess(clientUserId: string, orgId: string, planId: string): Promise<void> {
    const grant = await this.prisma.inspectionClientAccess.findFirst({
      where: {
        clientUserId,
        inspectionPlanId: planId,
        canSign: true,
        inspectionPlan: { orgId, deletedAt: null },
      },
      select: { inspectionPlanId: true },
    });
    if (!grant) {
      throw new ForbiddenException('Geen recht om dit document te ondertekenen');
    }
  }

  /**
   * Niet-gooiende variant van assertSignAccess (B-406a): geeft terug óf de klant
   * op dit plan mag ondertekenen, zodat de UI de knop kan verbergen i.p.v. pas
   * na het tekenen een 403 te tonen.
   */
  async hasSignAccess(clientUserId: string, orgId: string, planId: string): Promise<boolean> {
    const grant = await this.prisma.inspectionClientAccess.findFirst({
      where: {
        clientUserId,
        inspectionPlanId: planId,
        canSign: true,
        inspectionPlan: { orgId, deletedAt: null },
      },
      select: { inspectionPlanId: true },
    });
    return !!grant;
  }

  /** Plan-ids (binnen deze org) waarop de klant een canSign-grant heeft (B-406a). */
  async signablePlanIds(clientUserId: string, orgId: string): Promise<string[]> {
    const rows = await this.prisma.inspectionClientAccess.findMany({
      where: { clientUserId, canSign: true, inspectionPlan: { orgId, deletedAt: null } },
      select: { inspectionPlanId: true },
    });
    return rows.map((r) => r.inspectionPlanId);
  }

  /**
   * B-412: staat de vier-ogen-review-gate voor deze org aan? Bewust vers uit de
   * DB (niet uit de tenant-cache) zodat een org-wijziging direct doorwerkt.
   */
  async reviewGateEnabled(orgId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { inspectionReviewEnabled: true },
    });
    return org?.inspectionReviewEnabled ?? true;
  }

  /**
   * B-412: is de INHOUD (constateringen/documenten) van een plan met deze status
   * klant-zichtbaar? Bij orgs met de review-gate uit verdwijnt er niets — de
   * gate geldt alleen wanneer review aanstaat.
   */
  async isContentReleased(orgId: string, statusCode: string): Promise<boolean> {
    if (CLIENT_CONTENT_RELEASED_STATUSES.includes(statusCode)) return true;
    return !(await this.reviewGateEnabled(orgId));
  }

  /**
   * Statuscode van een (toegankelijk) plan ophalen + release-check in één stap,
   * voor content-routes van sub-services (findings/documenten).
   */
  async isPlanContentReleased(orgId: string, planId: string): Promise<boolean> {
    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id: planId, orgId, deletedAt: null },
      select: { statusCode: true },
    });
    if (!plan) return false;
    return this.isContentReleased(orgId, plan.statusCode);
  }

  async list(user: CurrentClientUserData, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const { contactIds, planIds } = await this.accessScope(user.id, org);
    const or = this.scopeOr(contactIds, planIds);
    if (!or) return [];

    return this.prisma.inspectionPlan.findMany({
      where: { orgId: org, deletedAt: null, OR: or },
      select: {
        id: true,
        projectName: true,
        referenceNumber: true,
        statusCode: true,
        normTypeCode: true,
        inspectionTypeCode: true,
        plannedDate: true,
        completedAt: true,
        addressStreet: true,
        addressHouseNumber: true,
        addressPostalCode: true,
        addressCity: true,
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(user: CurrentClientUserData, orgId: string | null, id: string) {
    const org = this.requireOrg(orgId);
    await this.assertInspectionAccess(user.id, org, id);

    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id, orgId: org, deletedAt: null },
      include: {
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        // Rauwe inspecteur-contactvelden + consent worden alleen geselecteerd om ze server-side
        // te resolven; ze worden hieronder NIET in de response opgenomen (zie leak-strip).
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            contactPhone: true,
            contactEmail: true,
            sharePhoneWithClients: true,
            shareEmailWithClients: true,
          },
        },
        // reviewer is bewust GEEN klant-facing inspecteur → geen contactgegevens.
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        installationResponsible: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        // Org-modus + statische waarden, enkel voor de resolutie (worden niet teruggegeven).
        organization: {
          select: {
            inspectorPhoneDisplay: true,
            inspectorEmailDisplay: true,
            inspectorStaticPhone: true,
            inspectorStaticEmail: true,
          },
        },
        generatedDocuments: {
          select: {
            id: true,
            documentType: true,
            status: true,
            generatedAt: true,
            finalizedAt: true,
            pdfUrl: true,
            signatures: {
              select: {
                id: true,
                signerRoleCode: true,
                signerName: true,
                status: true,
                signedAt: true,
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Inspectie niet gevonden');

    // B-412 (WP-B9): inhoud (constateringen + documenten) pas vanaf review
    // klant-zichtbaar; metadata blijft altijd staan. Bij een org met de
    // vier-ogen-gate uit is alles zichtbaar (contentReleased altijd true).
    const contentReleased = await this.isContentReleased(org, plan.statusCode);

    // Asset-boom: de findings dragen sinds de unified-tree zelf assetNodeId + inspectionPlanId.
    // We halen de findings van dit plan op en groeperen ze onder hun asset-node, zodat de klant
    // exact de assets ziet die constateringen hebben (de vorige plan.assets-relatie bestaat niet meer).
    const findings = contentReleased
      ? await this.prisma.finding.findMany({
          where: { inspectionPlanId: id, orgId: org, deletedAt: null },
          select: {
            id: true,
            assetNodeId: true,
            statusCode: true,
            shortDescription: true,
            classificationValues: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const assetNodeIds = [...new Set(findings.map((f) => f.assetNodeId))];
    const assetNodes = assetNodeIds.length
      ? await this.prisma.assetNode.findMany({
          where: { id: { in: assetNodeIds }, orgId: org, deletedAt: null },
          select: { id: true, name: true, typeCode: true, statusCode: true },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    const assets = assetNodes.map((node) => ({
      id: node.id,
      name: node.name,
      assetType: node.typeCode,
      statusCode: node.statusCode,
      findings: findings
        .filter((f) => f.assetNodeId === node.id)
        .map((f) => ({
          id: f.id,
          statusCode: f.statusCode,
          shortDescription: f.shortDescription,
          classificationValues: f.classificationValues,
        })),
    }));

    // Leak-strip: verwijder de org-modus en de rauwe inspecteur-velden uit de response en vervang
    // de inspecteur-ref door uitsluitend het server-side geresolveerde telefoon/e-mail (of null).
    // criticalRepairNotifiedAt is een staf-intern procesveld (PRD-14) → strippen.
    const { organization, assignedUser, criticalRepairNotifiedAt: _internal, ...planRest } = plan;
    void _internal;
    const assignedInspector = assignedUser
      ? {
          id: assignedUser.id,
          firstName: assignedUser.firstName,
          lastName: assignedUser.lastName,
          ...resolveInspectorContact(organization, assignedUser),
        }
      : null;

    const findingCounts = {
      total: findings.length,
      open: findings.filter((f) => f.statusCode === STATUS_OPEN).length,
      resolved: findings.filter((f) => f.statusCode === STATUS_RESOLVED).length,
    };
    return {
      ...planRest,
      // Documenten van een niet-vrijgegeven rapport niet meesturen (B-412).
      generatedDocuments: contentReleased ? planRest.generatedDocuments : [],
      assets,
      assignedUser: assignedInspector,
      findingCounts,
      contentReleased,
    };
  }

  /** Documenten van een inspectie (klant). */
  async getDocuments(user: CurrentClientUserData, orgId: string | null, planId: string) {
    const org = this.requireOrg(orgId);
    await this.assertInspectionAccess(user.id, org, planId);

    // B-412: documenten van een nog niet gereviewd rapport zijn niet klant-zichtbaar.
    if (!(await this.isPlanContentReleased(org, planId))) return [];

    const [documents, canSign] = await Promise.all([
      this.prisma.generatedDocument.findMany({
        where: { inspectionPlanId: planId, orgId: org },
        select: {
          id: true,
          documentType: true,
          status: true,
          generatedAt: true,
          finalizedAt: true,
          pdfUrl: true,
          signatures: {
            select: {
              id: true,
              signerRoleCode: true,
              signerName: true,
              signerFunction: true,
              status: true,
              signedAt: true,
            },
          },
        },
        orderBy: { generatedAt: 'asc' },
      }),
      // B-406a: teken-recht is een per-plan grant; de UI verbergt de knop zonder recht.
      this.hasSignAccess(user.id, org, planId),
    ]);
    return documents.map((d) => ({ ...d, canSign }));
  }

  /** Constateringen van een inspectie (klant), met laatste resolutie. */
  async getFindings(user: CurrentClientUserData, orgId: string | null, planId: string) {
    const org = this.requireOrg(orgId);
    await this.assertInspectionAccess(user.id, org, planId);

    // B-412: constateringen van een nog niet gereviewd rapport zijn niet klant-zichtbaar.
    if (!(await this.isPlanContentReleased(org, planId))) return [];

    return this.prisma.finding.findMany({
      where: { orgId: org, deletedAt: null, inspectionPlanId: planId },
      include: {
        assetNode: { select: { id: true, name: true, description: true } },
        resolutions: {
          orderBy: { resolvedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            statusCode: true,
            description: true,
            resolvedAt: true,
            verifiedAt: true,
            verificationNotes: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Dashboard-samenvatting voor de klant (binnen deze org). */
  async dashboard(user: CurrentClientUserData, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const { contactIds, planIds } = await this.accessScope(user.id, org);
    const or = this.scopeOr(contactIds, planIds);
    if (!or) {
      return { recentInspections: [], pendingSignatures: [], openFindingsCount: 0, totalInspections: 0 };
    }
    const accessFilter = { orgId: org, deletedAt: null as null, OR: or };

    const [recentInspections, allPlans] = await Promise.all([
      this.prisma.inspectionPlan.findMany({
        where: accessFilter,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          projectName: true,
          referenceNumber: true,
          statusCode: true,
          normTypeCode: true,
          inspectionTypeCode: true,
          plannedDate: true,
          completedAt: true,
          addressStreet: true,
          addressHouseNumber: true,
          addressCity: true,
          contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.inspectionPlan.findMany({
        where: accessFilter,
        select: { id: true, statusCode: true },
      }),
    ]);
    const allPlanIds = allPlans.map((p) => p.id);

    // B-412: tellers en actie-items alleen over plannen waarvan de inhoud is
    // vrijgegeven (review-gate); met de org-toggle uit telt alles gewoon mee.
    const gateEnabled = await this.reviewGateEnabled(org);
    const releasedPlanIds = gateEnabled
      ? allPlans
          .filter((p) => CLIENT_CONTENT_RELEASED_STATUSES.includes(p.statusCode))
          .map((p) => p.id)
      : allPlanIds;

    // B-406a: het dashboard-actie-item "ondertekenen" alleen voor plannen waar
    // deze klant daadwerkelijk teken-recht (canSign) op heeft.
    const signableIds = new Set(await this.signablePlanIds(user.id, org));
    const actionablePlanIds = releasedPlanIds.filter((id) => signableIds.has(id));

    const [pendingSignatures, openFindingsCount] = await Promise.all([
      actionablePlanIds.length
        ? this.prisma.documentSignature.findMany({
            where: {
              signerRoleCode: 'CLIENT',
              status: { in: [SignatureStatus.PENDING, SignatureStatus.REQUESTED] },
              generatedDocument: { inspectionPlanId: { in: actionablePlanIds } },
            },
            select: {
              id: true,
              generatedDocument: {
                select: {
                  id: true,
                  documentType: true,
                  inspectionPlan: { select: { id: true, projectName: true, addressCity: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      releasedPlanIds.length
        ? this.prisma.finding.count({
            where: {
              statusCode: STATUS_OPEN,
              deletedAt: null,
              inspectionPlanId: { in: releasedPlanIds },
            },
          })
        : Promise.resolve(0),
    ]);

    return {
      recentInspections,
      pendingSignatures: pendingSignatures.map((s) => ({
        signatureId: s.id,
        documentId: s.generatedDocument.id,
        documentType: s.generatedDocument.documentType,
        inspectionPlanId: s.generatedDocument.inspectionPlan.id,
        projectName: s.generatedDocument.inspectionPlan.projectName,
        city: s.generatedDocument.inspectionPlan.addressCity,
      })),
      openFindingsCount,
      totalInspections: allPlanIds.length,
    };
  }
}
