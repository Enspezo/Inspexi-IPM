// Herstelsessie-guard (PRD-14 §14.6). Valideert het sessietoken uit de
// Authorization-header (Bearer <token>), controleert status + expiry + org-match
// (subdomein-tenant) en hangt de sessie op de request (`request.repairSession`).
//
// Bewuste afwijking van "alleen ACTIVE": een COMPLETED-sessie blijft leesbaar
// (bevestigingsscherm + PDF-download na ondertekenen); mutaties (claim/foto's/
// complete/sign) asserteren ACTIVE in de service.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RepairSession } from '@prisma/client';
import { RepairSessionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { REPAIR_SESSION_EXPIRED_ERROR } from '@/common';
import type { TenantContext } from '@/common/interfaces/tenant-context.interface';

export interface RequestWithRepairSession extends Request {
  repairSession: RepairSession;
  tenant?: TenantContext;
}

@Injectable()
export class RepairSessionGuard implements CanActivate {
  private readonly logger = new Logger(RepairSessionGuard.name);
  private readonly isLocalhost: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.isLocalhost = this.config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRepairSession>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('Geen herstelsessie-token meegegeven');
    }

    const session = await this.prisma.repairSession.findUnique({ where: { token } });
    if (!session || session.status === RepairSessionStatus.EXPIRED) {
      throw new UnauthorizedException(REPAIR_SESSION_EXPIRED_ERROR);
    }
    // Lazy expiry geldt alleen voor ACTIVE-sessies (review #8): een COMPLETED-
    // sessie houdt haar eindstatus en blijft leesbaar (bevestiging/PDF), ook na
    // de 72u-TTL; mutaties blijven geblokkeerd via assertActive in de service.
    if (session.status === RepairSessionStatus.ACTIVE && session.expiresAt < new Date()) {
      // Markeer de sessie als verlopen (claims blijven geldig, PRD §14.11).
      this.prisma.repairSession
        .update({ where: { id: session.id }, data: { status: RepairSessionStatus.EXPIRED } })
        .catch(() => undefined);
      throw new UnauthorizedException(REPAIR_SESSION_EXPIRED_ERROR);
    }

    // Org-match via het subdomein: een sessie van org A is onbruikbaar op org B's
    // subdomein. Zonder tenant-org (onbekende host, bv. 127.0.0.1 in E2E, of het
    // apex-/superuser-domein) alleen op localhost door; in productie fail-secure
    // (F10 — spiegelt de TenantGuard). `request.tenant` ontbreekt alleen als de
    // middleware niet is toegepast (unit-tests zonder HTTP-laag) → door.
    const tenantOrgId = request.tenant?.orgId ?? null;
    if (tenantOrgId && tenantOrgId !== session.orgId) {
      throw new UnauthorizedException('Ongeldige herstelsessie');
    }
    if (request.tenant && tenantOrgId === null && !this.isLocalhost) {
      throw new UnauthorizedException('Gebruik het subdomein van uw organisatie');
    }

    request.repairSession = session;

    // lastActivityAt bijwerken: fire-and-forget, mag de request nooit blokkeren.
    this.prisma.repairSession
      .update({ where: { id: session.id }, data: { lastActivityAt: new Date() } })
      .catch((err) => this.logger.warn(`lastActivityAt-update mislukt: ${err?.message}`));

    return true;
  }
}
