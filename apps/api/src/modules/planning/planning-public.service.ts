import { Injectable, BadRequestException } from '@nestjs/common';
import {
  AcceptanceStatus,
  NotificationType,
  RescheduleStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanningService } from './planning.service';
import { AddQuestionDto, CreateRescheduleRequestDto } from './dto';

@Injectable()
export class PlanningPublicService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private planning: PlanningService,
  ) {}

  // ─── Public portal ─────────────────────────────────────────

  async findByPublicToken(token: string) {
    const item = assertFound(await this.prisma.planningItem.findUnique({
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
    }), 'Afspraak');

    // Attach shared documents (from this planning item + linked quote + linked request)
    const documents = await this.getSharedDocuments(token);
    return { ...item, documents };
  }

  async addClientQuestion(token: string, dto: AddQuestionDto) {
    const item = assertFound(
      await this.prisma.planningItem.findUnique({
        where: { publicToken: token },
        select: { id: true, orgId: true, createdBy: true, productName: true },
      }),
      'Afspraak',
    );

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
    const item = assertFound(
      await this.prisma.planningItem.findUnique({
        where: { publicToken: token },
        select: { id: true, orgId: true, createdBy: true, productName: true, isCancelled: true },
      }),
      'Afspraak',
    );
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

    await this.planning.addHistoryEntry(
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
    const item = assertFound(
      await this.prisma.planningItem.findUnique({
        where: { publicToken: token },
        select: { id: true, quoteId: true },
      }),
      'Afspraak',
    );

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
}
