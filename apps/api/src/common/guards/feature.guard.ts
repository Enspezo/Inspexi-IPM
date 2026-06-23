import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import {
  REQUIRES_FEATURE_KEY,
  ALLOW_DOWNGRADED_EXPORT_KEY,
} from '../decorators/requires-feature.decorator';
import { TenantContext } from '../interfaces/tenant-context.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { FeatureKey } from '@/modules/entitlements/feature-catalog';

/**
 * Dwingt de SaaS-feature-entitlements af (PRD-09 §5.1). Geregistreerd als laatste
 * globale guard, ná de TenantGuard (volgorde: Jwt → Roles → Tenant → Feature).
 *
 * Werkt uitsluitend op routes die expliciet met `@RequiresFeature(...)` (of
 * `@AllowDowngradedExport()`) zijn geannoteerd. Niet-geannoteerde routes —
 * álle core/platform-endpoints — laat de guard ongemoeid door. Daarmee kan een
 * core-route nooit per ongeluk gegate raken: gating is opt-in via de decorator.
 *
 * Org-bepaling: de organisatie komt uit het subdomein (`tenant.orgId`), exact
 * zoals de TenantGuard dat doet. In productie arriveren staf-, publieke én
 * klantportaal-requests altijd op het org-subdomein, dus `tenant.orgId` is dan
 * gezet. Een onbekende host (bv. `127.0.0.1` in e2e) heeft `tenant.orgId = null`
 * en valt op localhost open — net als bij de TenantGuard; in productie falen we
 * daar veilig dicht.
 *
 * Dev/e2e-uitzondering: een org zónder enige toegekende feature (geen plan en
 * geen overrides → lege set) is "nog niet ingericht" en valt op localhost open,
 * zodat bestaande e2e-fixtures (die geen plan zetten) blijven werken. Geseede
 * demo-orgs hebben wél een plan en worden dus ook lokaal afgedwongen.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  private readonly logger = new Logger(FeatureGuard.name);
  private readonly isLocalhost: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
  ) {
    this.isLocalhost =
      this.config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures =
      this.reflector.getAllAndOverride<FeatureKey[]>(REQUIRES_FEATURE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const allowDowngradedExport =
      this.reflector.getAllAndOverride<boolean>(ALLOW_DOWNGRADED_EXPORT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    // Niet-gegate route (geen feature-key, geen export-pad) → core/platform,
    // altijd door.
    if (!allowDowngradedExport && requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenant: TenantContext | undefined = request.tenant;

    // Geen tenant-context (middleware niet toegepast, bv. in unit-tests) → door.
    if (!tenant) {
      return true;
    }

    // SUPERUSER → altijd door (geen org; impliciet alle features).
    const isSuperuser =
      Array.isArray(user?.roles) && user.roles.includes(Role.SUPERUSER);
    if (isSuperuser) {
      if (allowDowngradedExport) {
        this.auditDowngradedExport(context, request, 'SUPERUSER');
      }
      return true;
    }

    // Downgrade-/export-pad (§5.4): slaat de feature-check over zodat een
    // afgeschakelde org haar data nog kan exporteren. Toegang blijft (voor nu)
    // SUPERUSER-only; "expliciete org-toestemming" is een toekomstig
    // uitbreidingspunt. Altijd ge-audit-logd — ook de geweigerde poging.
    if (allowDowngradedExport) {
      this.auditDowngradedExport(context, request, 'DENIED');
      throw new ForbiddenException({
        success: false,
        message: 'Alleen een beheerder mag gedowngradede data exporteren',
        code: 'DOWNGRADED_EXPORT_FORBIDDEN',
      });
    }

    const orgId = tenant.orgId;
    if (orgId === null) {
      // Onbekende host (127.0.0.1/dev) of superuser-domein zonder org. Op
      // localhost door (mirrors TenantGuard); in productie veilig dicht.
      if (this.isLocalhost) {
        return true;
      }
      throw this.featureNotInPlan();
    }

    const enabled = await this.entitlements.getEnabledFeatures(orgId);

    // Dev/e2e: nog niet ingerichte org (lege set) → op localhost niet gaten.
    if (enabled.length === 0 && this.isLocalhost) {
      return true;
    }

    const hasAll = requiredFeatures.every((key) => enabled.includes(key));
    if (!hasAll) {
      throw this.featureNotInPlan();
    }

    return true;
  }

  private featureNotInPlan(): ForbiddenException {
    return new ForbiddenException({
      success: false,
      message: 'Deze functie zit niet in uw abonnement',
      code: 'FEATURE_NOT_IN_PLAN',
    });
  }

  /** Audittrail voor het downgrade-/export-pad (§5.4) — altijd, ook bij weigering. */
  private auditDowngradedExport(
    context: ExecutionContext,
    request: { method?: string; url?: string; user?: { id?: string; orgId?: string }; tenant?: TenantContext },
    outcome: 'SUPERUSER' | 'DENIED',
  ): void {
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const orgId = request.user?.orgId ?? request.tenant?.orgId ?? '-';
    this.logger.warn(
      `[AUDIT] Downgraded export ${outcome}: userId=${request.user?.id ?? '-'} ` +
        `orgId=${orgId} route=${request.method ?? '?'} ${request.url ?? '?'} handler=${handler}`,
    );
  }
}
