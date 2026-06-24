import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Role } from '@prisma/client';
import { SupportAccessService } from '@/modules/organizations/support-access.service';

/**
 * IMP_PRD-10 Fase 5 — access-logging.
 *
 * Logt een ACCESSED-regel wanneer een SUPERUSER een org-subdomein bekijkt
 * terwijl support-toegang voor die org aanstaat. De org-status komt uit de al
 * gecachete `TenantContext` (TenantMiddleware → TenantCacheService) — dus géén
 * extra DB-read op de hot path. In-memory throttle: max. 1× per dag per
 * org+superuser (reset bij herstart — acceptabel; consent-trail, geen billing).
 *
 * Vuurt NIET op het superuser-domein (mijn.localhost): daar is
 * `tenant.organization` null en `tenant.orgId` null.
 */
@Injectable()
export class SupportAccessInterceptor implements NestInterceptor {
  private readonly seen = new Map<string, string>(); // `${orgId}:${userId}` → yyyy-mm-dd

  constructor(private supportAccess: SupportAccessService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const tenant = req.tenant; // TenantContext (TenantMiddleware), org uit cache

    if (
      user?.roles?.includes(Role.SUPERUSER) &&
      tenant?.orgId &&
      tenant?.organization?.supportAccessEnabled
    ) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `${tenant.orgId}:${user.id}`;
      if (this.seen.get(key) !== today) {
        this.seen.set(key, today);
        // fire-and-forget; blokkeert de request niet
        void this.supportAccess
          .logAccess(tenant.orgId, user.id, req.ip)
          .catch(() => undefined);
      }
    }

    return next.handle();
  }
}
