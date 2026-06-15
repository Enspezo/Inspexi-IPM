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
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';

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
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        installationResponsible: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        assets: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            assetType: true,
            statusCode: true,
            findings: {
              where: { deletedAt: null },
              select: { id: true, statusCode: true, shortDescription: true, classificationValues: true },
            },
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

    const allFindings = plan.assets.flatMap((a) => a.findings);
    const findingCounts = {
      total: allFindings.length,
      open: allFindings.filter((f) => f.statusCode === 'open').length,
      resolved: allFindings.filter((f) => f.statusCode === 'resolved').length,
    };
    return { ...plan, findingCounts };
  }

  /** Documenten van een inspectie (klant). */
  async getDocuments(user: CurrentClientUserData, orgId: string | null, planId: string) {
    const org = this.requireOrg(orgId);
    await this.assertInspectionAccess(user.id, org, planId);

    return this.prisma.generatedDocument.findMany({
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
    });
  }

  /** Constateringen van een inspectie (klant), met laatste resolutie. */
  async getFindings(user: CurrentClientUserData, orgId: string | null, planId: string) {
    const org = this.requireOrg(orgId);
    await this.assertInspectionAccess(user.id, org, planId);

    return this.prisma.finding.findMany({
      where: { orgId: org, deletedAt: null, asset: { inspectionPlanId: planId, deletedAt: null } },
      include: {
        asset: { select: { id: true, name: true, locationDescription: true } },
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
      this.prisma.inspectionPlan.findMany({ where: accessFilter, select: { id: true } }),
    ]);
    const allPlanIds = allPlans.map((p) => p.id);

    const [pendingSignatures, openFindingsCount] = await Promise.all([
      this.prisma.documentSignature.findMany({
        where: {
          signerRoleCode: 'CLIENT',
          status: { in: [SignatureStatus.PENDING, SignatureStatus.REQUESTED] },
          generatedDocument: { inspectionPlanId: { in: allPlanIds } },
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
      }),
      allPlanIds.length
        ? this.prisma.finding.count({
            where: {
              statusCode: 'open',
              deletedAt: null,
              asset: { inspectionPlanId: { in: allPlanIds }, deletedAt: null },
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
