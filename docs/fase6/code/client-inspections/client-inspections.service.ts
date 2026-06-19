// Doel in apps/api: src/modules/client-inspections/client-inspections.service.ts
//
// Voorbeeld van de KLANT-data-scoping onder subdomein-tenancy. Een klant ziet alleen:
//   - inspectieplannen van Contacten in DEZE org waar hij ClientAccess op heeft, OF
//   - plannen waarop hij expliciete InspectionClientAccess (canView) heeft.
// orgId komt uit het subdomein (@CurrentTenant). Dit patroon herhaalt voor documents/findings/
// messages/requests.

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';

@Injectable()
export class ClientInspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireOrg(orgId: string | null): string {
    if (!orgId) throw new BadRequestException('Gebruik het subdomein van uw organisatie');
    return orgId;
  }

  /** Bouw de scope-filter: toegankelijke contact-ids (in deze org) + expliciete plan-ids. */
  private async accessScope(clientUserId: string, orgId: string) {
    const [access, planAccess] = await Promise.all([
      this.prisma.clientAccess.findMany({
        where: { clientUserId, contact: { orgId, isDeleted: false } },
        select: { contactId: true },
      }),
      this.prisma.inspectionClientAccess.findMany({
        where: { clientUserId, canView: true, inspectionPlan: { orgId } },
        select: { inspectionPlanId: true },
      }),
    ]);
    return {
      contactIds: access.map((a) => a.contactId),
      planIds: planAccess.map((p) => p.inspectionPlanId),
    };
  }

  async list(user: CurrentClientUserData, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const { contactIds, planIds } = await this.accessScope(user.id, org);
    if (contactIds.length === 0 && planIds.length === 0) return [];

    return this.prisma.inspectionPlan.findMany({
      where: {
        orgId: org,
        deletedAt: null,
        OR: [
          ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
          ...(planIds.length ? [{ id: { in: planIds } }] : []),
        ],
      },
      select: {
        id: true, projectName: true, referenceNumber: true, statusCode: true,
        inspectionTypeCode: true, plannedDate: true, completedAt: true,
        addressStreet: true, addressCity: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(user: CurrentClientUserData, orgId: string | null, id: string) {
    const org = this.requireOrg(orgId);
    const { contactIds, planIds } = await this.accessScope(user.id, org);
    const plan = await this.prisma.inspectionPlan.findFirst({
      where: {
        id, orgId: org, deletedAt: null,
        OR: [
          ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
          ...(planIds.length ? [{ id: { in: planIds } }] : []),
        ],
      },
      include: {
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
        assets: { where: { deletedAt: null }, select: { id: true, name: true, assetType: true, statusCode: true } },
      },
    });
    if (!plan) throw new NotFoundException('Inspectie niet gevonden');
    return plan;
  }
}
