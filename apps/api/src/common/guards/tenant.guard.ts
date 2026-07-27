import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TenantContext } from '../interfaces/tenant-context.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly isLocalhost: boolean;

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
  ) {
    this.isLocalhost =
      this.config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';
  }

  canActivate(context: ExecutionContext): boolean {
    // Skip for @Public() routes — they don't require auth so no tenant check
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenant: TenantContext | undefined = request.tenant;

    // If no tenant context (middleware not applied), allow through
    if (!tenant) {
      return true;
    }

    // If no user (should not happen after JWT guard, but safety check)
    if (!user) {
      return false;
    }

    // SUPERUSER can access any subdomain + base domain.
    //
    // Beslissing D2 (WP-B3, B-502/B-503/B-504): het subdomein bepaalt de
    // scope. Koppel de tenantcontext van het subdomein hier — het enige punt
    // dat user én tenant samen ziet — aan de request-user, zodat álle
    // downstream org-scoping (orgScope/requireOrg/`user.orgId`) automatisch
    // de bezochte org gebruikt. Op het superuser-domein (`mijn.*`) en op een
    // onbekende host blijft `orgId` null → platform-breed lezen.
    if (user.roles.includes(Role.SUPERUSER)) {
      if (tenant.orgId !== null && user.orgId !== tenant.orgId) {
        request.user = {
          ...user,
          orgId: tenant.orgId,
          organization: tenant.organization,
        };
      }
      return true;
    }

    // Unknown domain (e.g., 127.0.0.1 in tests, direct IP) → no tenant context.
    // Allowed only in local/dev (E2E tests run on 127.0.0.1). In production we
    // fail secure: an authenticated request must arrive on a known org subdomain.
    if (!tenant.isSuperuserDomain && tenant.orgId === null) {
      if (this.isLocalhost) {
        return true;
      }
      throw new ForbiddenException(
        'Gebruik het subdomein van uw organisatie',
      );
    }

    // Explicit SUPERUSER domain (mijn.inspexi.nl / mijn.localhost) — only SUPERUSER allowed
    if (tenant.isSuperuserDomain && tenant.orgId === null) {
      throw new ForbiddenException(
        'Gebruik het subdomein van uw organisatie om in te loggen',
      );
    }

    // Org subdomain — user must belong to this org
    if (tenant.orgId !== null && user.orgId !== tenant.orgId) {
      throw new ForbiddenException(
        'U heeft geen toegang tot deze organisatie',
      );
    }

    return true;
  }
}
