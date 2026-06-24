import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role, SupportAccessAction, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, assertFound } from '@/common';
import { TenantCacheService } from '@/common/services/tenant-cache.service';
import { SetSupportAccessDto } from './dto/support-access.dto';

/**
 * IMP_PRD-10 Fase 5 — Support-toegang.
 *
 * De organisatie geeft InspeXi-support expliciete, geauditeerde toestemming via
 * een toggle. SUPERUSER houdt technisch altijd toegang; deze toggle legt consent
 * + audittrail vast, met optionele JIT-expiry en logging van daadwerkelijke inzage.
 *
 * `SupportAccessLog` is een eigen, expliciet logmodel (NIET via de audit-`$use`
 * middleware — zie common/audit/audited-entities.ts).
 */
@Injectable()
export class SupportAccessService {
  constructor(
    private prisma: PrismaService,
    private tenantCache: TenantCacheService,
  ) {}

  /** ORG_ADMIN mag alleen de eigen org; SUPERUSER mag alle orgs. */
  private assertScope(user: User, orgId: string) {
    if (user.roles.includes(Role.SUPERUSER)) return;
    if (user.orgId !== orgId) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
  }

  async getStatus(user: User, orgId: string) {
    this.assertScope(user, orgId);
    return assertFound(
      await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { supportAccessEnabled: true, supportAccessExpiresAt: true },
      }),
      'Organisatie',
    );
  }

  async setAccess(
    user: User,
    orgId: string,
    dto: SetSupportAccessDto,
    ip?: string,
    userAgent?: string,
  ) {
    this.assertScope(user, orgId);

    const expiresAt =
      dto.enabled && dto.expiresInHours
        ? new Date(Date.now() + dto.expiresInHours * 3_600_000)
        : null;

    const [org] = await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: orgId },
        data: { supportAccessEnabled: dto.enabled, supportAccessExpiresAt: expiresAt },
        // `id` meenemen: de audit-`$use` middleware logt UPDATE met `result.id`
        // (een select zonder id → entityId null → NOT NULL-violatie in de audit-write).
        select: {
          id: true,
          slug: true,
          supportAccessEnabled: true,
          supportAccessExpiresAt: true,
        },
      }),
      this.prisma.supportAccessLog.create({
        data: {
          orgId,
          action: dto.enabled ? SupportAccessAction.ENABLED : SupportAccessAction.DISABLED,
          performedById: user.id,
          performedByRole: user.roles[0] ?? null,
          ip,
          userAgent,
          note: dto.note,
        },
      }),
    ]);

    // Tenant-cache direct invalideren zodat de access-logging interceptor de
    // nieuwe toggle-status meteen ziet i.p.v. tot 5 min uit een verouderde
    // cache (TenantMiddleware leest de org incl. deze velden uit die cache).
    this.tenantCache.invalidate(org.slug);

    return {
      supportAccessEnabled: org.supportAccessEnabled,
      supportAccessExpiresAt: org.supportAccessExpiresAt,
    };
  }

  async listLogs(user: User, orgId: string, page = 1, limit = 20) {
    this.assertScope(user, orgId);
    return paginate(this.prisma.supportAccessLog, {
      where: { orgId } as Prisma.SupportAccessLogWhereInput,
      include: {
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      page,
      limit,
    });
  }

  /** Schrijft een ACCESSED-regel (aangeroepen door de interceptor, al gethrottled). */
  async logAccess(orgId: string, userId: string, ip?: string) {
    await this.prisma.supportAccessLog.create({
      data: {
        orgId,
        action: SupportAccessAction.ACCESSED,
        performedById: userId,
        performedByRole: Role.SUPERUSER,
        ip,
      },
    });
  }

  /** JIT-expiry: zet verlopen grants uit en logt EXPIRED. Aangeroepen door de scheduler. */
  async expireGrants(now = new Date()): Promise<number> {
    const expired = await this.prisma.organization.findMany({
      where: {
        supportAccessEnabled: true,
        supportAccessExpiresAt: { not: null, lt: now },
      },
      select: { id: true, slug: true },
    });

    for (const org of expired) {
      await this.prisma.$transaction([
        this.prisma.organization.update({
          where: { id: org.id },
          data: { supportAccessEnabled: false, supportAccessExpiresAt: null },
        }),
        this.prisma.supportAccessLog.create({
          data: {
            orgId: org.id,
            action: SupportAccessAction.EXPIRED,
            note: 'Automatisch verlopen (JIT).',
          },
        }),
      ]);
      this.tenantCache.invalidate(org.slug);
    }

    return expired.length;
  }
}
