import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import {
  assertFound,
  assertAllowedImageUpload,
  resolveImageResponseType,
  ONLINE_HERSTEL_FEATURE,
} from '@/common';
import { TenantCacheService } from '@/common/services/tenant-cache.service';
import { requestContext } from '@/common/services/request-context';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  FeatureOverrideState,
} from './dto';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { analyzeEntitlements, isFeatureKey } from '@inspexi/entitlements';
import { RESERVED_SLUGS } from './reserved-slugs';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private tenantCache: TenantCacheService,
    private entitlements: EntitlementsService,
    private config: ConfigService,
  ) {}

  /**
   * B-505: weiger slugs die nooit als org-subdomein kunnen dienen. De statische
   * lijst dekt infrastructuurnamen; runtime komt het geconfigureerde
   * SUPERUSER_SUBDOMAIN erbij (de middleware kortsluit dat subdomein vóór de
   * slug-lookup, dus zo'n org zou permanent onbereikbaar zijn).
   */
  private assertSlugAllowed(slug: string): void {
    const superuserSubdomain = this.config.get<string>('SUPERUSER_SUBDOMAIN', 'mijn');
    if (slug === superuserSubdomain || RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(
        `Deze slug is gereserveerd en kan niet als subdomein gebruikt worden`,
      );
    }
  }

  async create(dto: CreateOrganizationDto) {
    this.assertSlugAllowed(dto.slug);
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Slug is al in gebruik');
    }

    return this.prisma.organization.create({ data: dto });
  }

  async findAll() {
    return this.prisma.organization.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return assertFound(
      await this.prisma.organization.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } },
      }),
      'Organisatie',
    );
  }

  async findUsers(orgId: string) {
    await this.findOne(orgId);
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
    });
    // Inactieve orgs zijn publiek onzichtbaar (offboarding)
    return assertFound(org && org.isActive ? org : null, 'Organisatie');
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    const current = await this.findOne(id);

    if (dto.slug) {
      this.assertSlugAllowed(dto.slug);
      const existing = await this.prisma.organization.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Slug is al in gebruik');
      }
    }

    // B-510: entitlement-afhankelijke vlaggen mogen alleen AAN gezet worden
    // mét het bijbehorende abonnement — anders ontstaat een tegenstrijdige
    // toestand ("aangevinkt" naast "Niet beschikbaar in uw abonnement") die
    // via de publieke by-slug-branding doorwerkt in de portal-UI. Alleen de
    // false→true-transitie wordt gegate: uitzetten (en aan laten staan na een
    // plan-downgrade) mag altijd. Automatisch terugzetten bij een downgrade is
    // beslispunt B6.
    if (dto.aiReviewEnabled === true && !current.aiReviewEnabled) {
      await this.entitlements.assertFeature(
        id,
        'AI_REVIEW',
        'AI-voorcontrole zit niet in uw abonnement',
      );
    }
    if (dto.onlineRepairDefault === true && !current.onlineRepairDefault) {
      await this.entitlements.assertFeature(
        id,
        ONLINE_HERSTEL_FEATURE,
        'Online herstel zit niet in uw abonnement',
      );
    }
    // AI-assistent: zelfde B-510-regel — de kill-switch weer AAN zetten vereist
    // het AI_AGENT-entitlement; uitzetten mag altijd. De rollenlijst is vrij
    // instelbaar (zonder entitlement heeft die toch geen effect: de FeatureGuard
    // blokkeert alle /ai-routes al).
    if (dto.aiAgentEnabled === true && !current.aiAgentEnabled) {
      await this.entitlements.assertFeature(
        id,
        'AI_AGENT',
        'De AI-assistent zit niet in uw abonnement',
      );
    }

    // PRD-15 §6.6: org-offboarding (deactiveren) wist alle AI-gesprekken van
    // de organisatie (AiMessage/AiPendingAction cascaden mee); AiUsageLog en
    // AuditLog blijven bewaard. Zelfde transactie als de statuswijziging.
    const isDeactivation = dto.isActive === false && current.isActive;

    const [updated, purgedAiConversations] = await this.prisma.$transaction(
      async (tx) => {
        const purged = isDeactivation
          ? (await tx.aiConversation.deleteMany({ where: { orgId: id } })).count
          : 0;
        const org = await tx.organization.update({
          where: { id },
          data: dto,
        });
        return [org, purged] as const;
      },
    );

    if (purgedAiConversations > 0) {
      // Herleidbaarheid van de gegevensverwijdering (AiConversation zit bewust
      // niet in de audit-registry); fire-and-forget, blokkeert de update niet.
      const ctx = requestContext.getStore();
      if (ctx?.userId) {
        this.prisma
          .writeAuditLog({
            entityType: 'Organization',
            entityId: id,
            action: 'UPDATE',
            snapshot: null,
            changes: { aiConversationsPurged: { from: purgedAiConversations, to: 0 } },
            userId: ctx.userId,
            orgId: id,
            ipAddress: ctx.ipAddress,
            source: ctx.source,
          })
          .catch((err) =>
            this.logger.error(`AI-retentie audit log fout: ${err}`),
          );
      }
    }

    // Tenant-cache direct invalideren zodat slug-wijziging of deactivatie
    // niet tot 5 minuten uit een verouderde cache geserveerd wordt
    this.tenantCache.invalidate(current.slug);
    if (updated.slug !== current.slug) {
      this.tenantCache.invalidate(updated.slug);
    }

    return updated;
  }

  // ─── SaaS-abonnementen (entitlements, PRD-09 §5.3) ──────────────────────────

  /**
   * Volledige entitlement-staat van een org voor de SUPERUSER-beheer-UI: het
   * toegewezen plan, de plan-defaults, de per-org-overrides, de effectieve set en
   * de dependency-waarschuwingen (afschakel-overrides die de closure terugdraait).
   */
  async getEntitlements(orgId: string) {
    const org = assertFound(
      await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          planId: true,
          plan: {
            select: {
              id: true,
              name: true,
              slug: true,
              features: { select: { featureKey: true } },
            },
          },
          features: {
            select: { featureKey: true, enabled: true, updatedAt: true },
            orderBy: { featureKey: 'asc' },
          },
        },
      }),
      'Organisatie',
    );

    const planFeatureKeys = org.plan?.features.map((f) => f.featureKey) ?? [];
    const overrides = org.features.map((f) => ({
      featureKey: f.featureKey,
      enabled: f.enabled,
    }));
    const { effective, warnings } = analyzeEntitlements(planFeatureKeys, overrides);

    return {
      planId: org.planId,
      plan: org.plan
        ? { id: org.plan.id, name: org.plan.name, slug: org.plan.slug }
        : null,
      planFeatureKeys,
      overrides: org.features,
      effective,
      warnings,
    };
  }

  /**
   * Wijst een plan toe aan een org (of ontkoppelt het met `planId: null`).
   * Invalideert de entitlements-cache van de org zodat de FeatureGuard direct de
   * nieuwe set hanteert. De `planId`-wijziging wordt automatisch ge-audit-logd
   * (Organization staat in de audit-registry).
   */
  async assignPlan(orgId: string, planId: string | null) {
    await this.findOne(orgId);

    if (planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new NotFoundException('Abonnement niet gevonden');
      }
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { planId },
    });
    this.entitlements.invalidate(orgId);

    return this.getEntitlements(orgId);
  }

  /**
   * Zet, wijzigt of verwijdert een per-org feature-override (tri-state). `PLAN`
   * verwijdert de override (volg de plan-default); `ENABLED`/`DISABLED` schakelen
   * bij/af. Invalideert de entitlements-cache van de org. We schrijven op `id`
   * (niet op de samengestelde unique) zodat de audit-middleware een nette
   * before/after-diff kan vastleggen.
   */
  async setFeatureOverride(
    orgId: string,
    featureKey: string,
    state: FeatureOverrideState,
    userId: string,
  ) {
    if (!isFeatureKey(featureKey)) {
      throw new BadRequestException(`Onbekende feature-key: ${featureKey}`);
    }
    await this.findOne(orgId);

    const existing = await this.prisma.organizationFeature.findUnique({
      where: { orgId_featureKey: { orgId, featureKey } },
    });

    if (state === FeatureOverrideState.PLAN) {
      if (existing) {
        await this.prisma.organizationFeature.delete({
          where: { id: existing.id },
        });
      }
    } else {
      const enabled = state === FeatureOverrideState.ENABLED;
      if (existing) {
        await this.prisma.organizationFeature.update({
          where: { id: existing.id },
          data: { enabled, updatedById: userId },
        });
      } else {
        await this.prisma.organizationFeature.create({
          data: { orgId, featureKey, enabled, updatedById: userId },
        });
      }
    }

    this.entitlements.invalidate(orgId);
    return this.getEntitlements(orgId);
  }

  /**
   * B-507 / WP-B4: de inhoud bepaalt het type, niet `file.mimetype` (client-header)
   * en niet `file.originalname` (bestandsnaam). SVG is uit de whitelist; zowel de
   * opslagextensie als het opgeslagen mimetype komen uit de magic bytes.
   */
  async uploadLogo(id: string, file: Express.Multer.File): Promise<string> {
    const detected = assertAllowedImageUpload(file);

    const org = await this.findOne(id);

    // Verwijder het oude logo als dat bestaat
    if (org.logoUrl) {
      await this.storage.delete(org.logoUrl).catch(() => {});
    }

    const storageKey = `logos/${id}/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(storageKey, file.buffer, detected.mimeType);

    await this.prisma.organization.update({
      where: { id },
      data: { logoUrl: storageKey },
    });

    return storageKey;
  }

  async downloadLogo(id: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
    disposition: 'inline' | 'attachment';
    storageKey: string;
  }> {
    const org = await this.findOne(id);
    if (!org.logoUrl) {
      throw new NotFoundException('Geen logo gevonden');
    }

    const buffer = await this.storage.download(org.logoUrl);

    // Het Content-Type komt uit de bytes, niet uit de extensie van de sleutel:
    // rijen van vóór WP-B4 kunnen nog op `.svg` eindigen en die mogen nooit als
    // `image/svg+xml` teruggaan (uitvoerbaar op het app-origin).
    const { mimeType, filename, disposition } = resolveImageResponseType(buffer, 'logo');

    return { buffer, mimeType, filename, disposition, storageKey: org.logoUrl };
  }

  async deleteLogo(id: string): Promise<void> {
    const org = await this.findOne(id);
    if (!org.logoUrl) return;

    await this.storage.delete(org.logoUrl).catch(() => {});
    await this.prisma.organization.update({
      where: { id },
      data: { logoUrl: null },
    });
  }
}
