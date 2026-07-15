import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { DEFAULT_AI_AGENT_ROLES } from './ai-config';

/**
 * Per-org kill-switch + toegestane-rollen voor de AI-assistent (PRD-12 §7.3/§7.5).
 * Draait ná de globale guards (Jwt → Roles → Tenant → Feature), dus `request.user`
 * en `request.tenant.organization` (volledige, gecachte org-rij) zijn beschikbaar.
 * SUPERUSER omzeilt; op localhost/onbekende host valt hij open (mirrors
 * TenantGuard/FeatureGuard) en in productie veilig dicht.
 */
@Injectable()
export class AiAgentAccessGuard implements CanActivate {
  private readonly isLocalhost: boolean;

  constructor(private readonly config: ConfigService) {
    this.isLocalhost =
      this.config.get<string>('BASE_DOMAIN', 'localhost') === 'localhost';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenant: TenantContext | undefined = request.tenant;

    if (Array.isArray(user?.roles) && user.roles.includes(Role.SUPERUSER)) {
      return true;
    }

    const org = tenant?.organization as
      | { aiAgentEnabled?: boolean; aiAgentAllowedRoles?: Role[] }
      | null
      | undefined;

    if (!org) {
      if (this.isLocalhost) return true;
      throw this.disabled();
    }

    if (org.aiAgentEnabled === false) {
      throw this.disabled();
    }

    const allowed =
      org.aiAgentAllowedRoles && org.aiAgentAllowedRoles.length > 0
        ? org.aiAgentAllowedRoles
        : DEFAULT_AI_AGENT_ROLES;

    const ok =
      Array.isArray(user?.roles) &&
      user.roles.some((r: Role) => allowed.includes(r));
    if (!ok) {
      throw new ForbiddenException({
        success: false,
        message: 'Je rol heeft geen toegang tot de AI-assistent',
        code: 'AI_AGENT_ROLE_FORBIDDEN',
      });
    }

    return true;
  }

  private disabled(): ForbiddenException {
    return new ForbiddenException({
      success: false,
      message: 'De AI-assistent is uitgeschakeld voor deze organisatie',
      code: 'AI_AGENT_DISABLED',
    });
  }
}
