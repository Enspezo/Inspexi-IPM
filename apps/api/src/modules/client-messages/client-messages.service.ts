// Klant-berichten per inspectie (InspectionMessage). Tenant-veilig via de gedeelde
// ClientInspectionsService.assertInspectionAccess (org uit subdomein + ClientAccess).
// Geport uit ../Inspexi-App/.../client-messages.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';

const MESSAGE_INCLUDE = {
  clientUser: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  attachments: true,
} as const;

@Injectable()
export class ClientMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inspections: ClientInspectionsService,
  ) {}

  async getMessages(user: CurrentClientUserData, orgId: string | null, planId: string) {
    const org = this.inspections.requireOrg(orgId);
    await this.inspections.assertInspectionAccess(user.id, org, planId);
    return this.prisma.inspectionMessage.findMany({
      where: { inspectionPlanId: planId },
      orderBy: { createdAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });
  }

  async sendMessage(
    user: CurrentClientUserData,
    orgId: string | null,
    planId: string,
    content: string,
  ) {
    const org = this.inspections.requireOrg(orgId);
    await this.inspections.assertInspectionAccess(user.id, org, planId);
    return this.prisma.inspectionMessage.create({
      data: { inspectionPlanId: planId, clientUserId: user.id, content },
      include: MESSAGE_INCLUDE,
    });
  }

  async markRead(
    user: CurrentClientUserData,
    orgId: string | null,
    planId: string,
    messageId: string,
  ) {
    const org = this.inspections.requireOrg(orgId);
    await this.inspections.assertInspectionAccess(user.id, org, planId);

    const message = await this.prisma.inspectionMessage.findFirst({
      where: { id: messageId, inspectionPlanId: planId },
      select: { id: true, userId: true, readAt: true },
    });
    if (!message) throw new NotFoundException('Bericht niet gevonden');

    // Alleen staf-berichten (userId) markeren als gelezen door de klant.
    if (message.userId && !message.readAt) {
      await this.prisma.inspectionMessage.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });
    }
    return { success: true };
  }
}
