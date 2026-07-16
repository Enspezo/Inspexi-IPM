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

  constructor(private readonly prisma: PrismaService) {}

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
    if (session.expiresAt < new Date()) {
      // Lazy expiry: markeer de sessie als verlopen (claims blijven geldig, PRD §14.11).
      this.prisma.repairSession
        .update({ where: { id: session.id }, data: { status: RepairSessionStatus.EXPIRED } })
        .catch(() => undefined);
      throw new UnauthorizedException(REPAIR_SESSION_EXPIRED_ERROR);
    }

    // Org-match via het subdomein: een sessie van org A is onbruikbaar op org B's
    // subdomein. Op een "unknown host" (bv. 127.0.0.1 in E2E) is er geen tenant-org.
    const tenantOrgId = request.tenant?.orgId ?? null;
    if (tenantOrgId && tenantOrgId !== session.orgId) {
      throw new UnauthorizedException('Ongeldige herstelsessie');
    }

    request.repairSession = session;

    // lastActivityAt bijwerken: fire-and-forget, mag de request nooit blokkeren.
    this.prisma.repairSession
      .update({ where: { id: session.id }, data: { lastActivityAt: new Date() } })
      .catch((err) => this.logger.warn(`lastActivityAt-update mislukt: ${err?.message}`));

    return true;
  }
}
