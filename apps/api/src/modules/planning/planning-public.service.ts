import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AcceptanceStatus,
  NotificationType,
  Prisma,
  RescheduleStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, publicTenantWhere, resolveInspectorContact } from '@/common';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanningService } from './planning.service';
import { AddQuestionDto, CreateRescheduleRequestDto } from './dto';

/**
 * Publieke afspraakpagina (`/public/planning/:token`).
 *
 * WP-B7/F1: de `publicToken`-lookup is gebonden aan de bezochte tenant
 * (`publicTenantWhere`) en de feature-gate (`UITVOERING_COMPLEET`) wordt in de
 * service tegen de EIGENAAR-org van de afspraak afgedwongen — niet via een
 * klasse-brede `@RequiresFeature` op de publieke controller, die op het
 * apex-domein (`PUBLIC_URL`, geen tenant-org) in productie hard 403 zou geven.
 */
@Injectable()
export class PlanningPublicService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private entitlements: EntitlementsService,
    private notifications: NotificationsService,
    private planning: PlanningService,
  ) {}

  /** Tenant-gebonden where-fragment voor de token-lookup (generieke 404 op een vreemd subdomein). */
  private tokenWhere(token: string, tenant?: TenantContext): Prisma.PlanningItemWhereInput {
    return { publicToken: token, ...publicTenantWhere(tenant, this.config, 'Afspraak') };
  }

  /** Entitlement tegen de EIGENAAR van de afspraak (niet de bezoekende tenant). */
  private assertOwnerFeature(orgId: string): Promise<void> {
    return this.entitlements.assertFeature(orgId, 'UITVOERING_COMPLEET');
  }

  // ─── Public portal ─────────────────────────────────────────

  async findByPublicToken(token: string, tenant?: TenantContext) {
    // B-306 (WP-B7): expliciete select-allowlist i.p.v. een include+spread die élk
    // kolomveld (incl. `internalNotes`) publiek maakte. Alleen wat de publieke
    // afspraakpagina daadwerkelijk toont mag hier staan — een nieuw veld toevoegen
    // is een bewuste, geteste beslissing (zie de key-snapshot-e2e in
    // test/public-endpoints.e2e-spec.ts). `orgId` is server-side nodig voor de
    // inspecteur-contactresolutie en wordt vóór de return weer weggestript.
    const item = assertFound(await this.prisma.planningItem.findFirst({
      where: this.tokenWhere(token, tenant),
      select: {
        id: true,
        orgId: true, // intern — wordt hieronder uit de response gestript
        status: true,
        productName: true,
        scheduledDate: true,
        durationHours: true,
        isMultiDay: true,
        labels: true,
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
          select: {
            id: true,
            isPrimary: true,
            acceptanceStatus: true,
            user: {
              // Rauwe contact-/consent-velden alleen voor server-side resolutie (zie leak-strip).
              select: {
                id: true,
                firstName: true,
                lastName: true,
                color: true,
                initials: true,
                contactPhone: true,
                contactEmail: true,
                sharePhoneWithClients: true,
                shareEmailWithClients: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' as const }],
        },
        organization: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
        sessions: {
          where: { isCancelled: false },
          select: {
            id: true,
            sessionNumber: true,
            scheduledDate: true,
            durationHours: true,
            status: true,
            notes: true,
            isCancelled: true,
            sessionInspectors: {
              where: { acceptanceStatus: AcceptanceStatus.ACCEPTED },
              select: {
                id: true,
                isPrimary: true,
                acceptanceStatus: true,
                user: {
                  // Rauwe contact-/consent-velden alleen voor server-side resolutie (zie leak-strip).
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    color: true,
                    initials: true,
                    contactPhone: true,
                    contactEmail: true,
                    sharePhoneWithClients: true,
                    shareEmailWithClients: true,
                  },
                },
              },
              orderBy: [{ isPrimary: 'desc' as const }],
            },
          },
          orderBy: { sessionNumber: 'asc' as const },
        },
      },
    }), 'Afspraak');
    await this.assertOwnerFeature(item.orgId);

    // Org-modus + statische waarden apart ophalen — deze verlaten de response nooit.
    const orgContactSettings = assertFound(
      await this.prisma.organization.findUnique({
        where: { id: item.orgId },
        select: {
          inspectorPhoneDisplay: true,
          inspectorEmailDisplay: true,
          inspectorStaticPhone: true,
          inspectorStaticEmail: true,
        },
      }),
      'Organisatie',
    );

    // Leak-strip: vervang elke inspecteur-`user` door alleen veilige velden + server-side
    // geresolveerd telefoon/e-mail (of null). Rauwe contactgegevens/consent gaan nooit mee.
    type RawInspectorUser = {
      id: string;
      firstName: string;
      lastName: string;
      color: string | null;
      initials: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      sharePhoneWithClients: boolean;
      shareEmailWithClients: boolean;
    };
    const toPublicInspectorUser = (user: RawInspectorUser) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      color: user.color,
      initials: user.initials,
      ...resolveInspectorContact(orgContactSettings, user),
    });
    const inspectors = item.inspectors.map((i) => ({
      ...i,
      user: toPublicInspectorUser(i.user),
    }));
    const sessions = item.sessions.map((s) => ({
      ...s,
      sessionInspectors: s.sessionInspectors.map((si) => ({
        ...si,
        user: toPublicInspectorUser(si.user),
      })),
    }));

    // Attach shared documents (from this planning item + linked quote + linked request)
    const documents = await this.getSharedDocuments(token, tenant);
    // `orgId` was alleen nodig voor de contactresolutie hierboven — nooit teruggeven.
    const { orgId: _orgId, ...publicItem } = item;
    return { ...publicItem, inspectors, sessions, documents };
  }

  async addClientQuestion(token: string, dto: AddQuestionDto, tenant?: TenantContext) {
    const item = assertFound(
      await this.prisma.planningItem.findFirst({
        where: this.tokenWhere(token, tenant),
        select: { id: true, orgId: true, createdBy: true, productName: true },
      }),
      'Afspraak',
    );
    await this.assertOwnerFeature(item.orgId);

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

  async createRescheduleRequest(
    token: string,
    dto: CreateRescheduleRequestDto,
    tenant?: TenantContext,
  ) {
    const item = assertFound(
      await this.prisma.planningItem.findFirst({
        where: this.tokenWhere(token, tenant),
        select: { id: true, orgId: true, createdBy: true, productName: true, isCancelled: true },
      }),
      'Afspraak',
    );
    await this.assertOwnerFeature(item.orgId);
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

  /**
   * Entiteit-filters waar dit token toegang toe geeft: PLANNING-docs van de
   * afspraak zelf, plus QUOTE-/REQUEST-docs van de gekoppelde offerte/aanvraag.
   */
  private async sharedEntityFilters(item: { id: string; quoteId: string | null }) {
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
    return entityFilters;
  }

  async getSharedDocuments(token: string, tenant?: TenantContext) {
    const item = assertFound(
      await this.prisma.planningItem.findFirst({
        where: this.tokenWhere(token, tenant),
        select: { id: true, orgId: true, quoteId: true },
      }),
      'Afspraak',
    );
    await this.assertOwnerFeature(item.orgId);

    const entityFilters = await this.sharedEntityFilters(item);
    return this.prisma.document.findMany({
      where: {
        OR: entityFilters,
        orgId: item.orgId,
        isSharedWithClient: true,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Eén gedeelde bijlage (metadata) voor download — org-gebonden aan de afspraak. */
  async findSharedDocument(token: string, docId: string, tenant?: TenantContext) {
    const item = assertFound(
      await this.prisma.planningItem.findFirst({
        where: this.tokenWhere(token, tenant),
        select: { id: true, orgId: true, quoteId: true },
      }),
      'Afspraak',
    );
    await this.assertOwnerFeature(item.orgId);

    const entityFilters = await this.sharedEntityFilters(item);
    return assertFound(
      await this.prisma.document.findFirst({
        where: {
          id: docId,
          OR: entityFilters,
          orgId: item.orgId,
          isSharedWithClient: true,
          isDeleted: false,
        },
      }),
      'Document',
    );
  }

  /** Afspraak + relaties voor het .ics-bestand (zie `PlanningIcalService.generateSingleEvent`). */
  async findForIcs(token: string, tenant?: TenantContext) {
    const item = assertFound(
      await this.prisma.planningItem.findFirst({
        where: this.tokenWhere(token, tenant),
        include: {
          location: { select: { street: true, houseNumber: true, postalCode: true, city: true } },
          contact: { select: { companyName: true, firstName: true, lastName: true } },
          sessions: {
            where: { isCancelled: false },
            orderBy: { sessionNumber: 'asc' },
            select: {
              id: true,
              sessionNumber: true,
              scheduledDate: true,
              durationHours: true,
              status: true,
              isCancelled: true,
              notes: true,
            },
          },
        },
      }),
      'Afspraak',
    );
    await this.assertOwnerFeature(item.orgId);
    return item;
  }
}
