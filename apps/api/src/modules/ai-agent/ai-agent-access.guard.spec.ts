import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AiAgentAccessGuard } from './ai-agent-access.guard';

function ctx(user: any, tenant: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, tenant }) }),
  } as any;
}

const config = (baseDomain: string) =>
  ({ get: (_k: string, d: string) => baseDomain ?? d }) as any;

const localhost = () => new AiAgentAccessGuard(config('localhost'));
const production = () => new AiAgentAccessGuard(config('inspexi.nl'));

describe('AiAgentAccessGuard', () => {
  it('lets SUPERUSER through regardless of org config', () => {
    const guard = production();
    expect(
      guard.canActivate(ctx({ roles: [Role.SUPERUSER] }, { organization: null })),
    ).toBe(true);
  });

  it('falls open on localhost when there is no tenant org (dev/e2e)', () => {
    const guard = localhost();
    expect(
      guard.canActivate(ctx({ roles: [Role.BACKOFFICE] }, { organization: null })),
    ).toBe(true);
  });

  it('fails closed in production when the org row is missing', () => {
    const guard = production();
    expect(() =>
      guard.canActivate(ctx({ roles: [Role.BACKOFFICE] }, { organization: null })),
    ).toThrow(ForbiddenException);
  });

  it('blocks when the kill-switch (aiAgentEnabled=false) is off', () => {
    const guard = production();
    expect(() =>
      guard.canActivate(
        ctx(
          { roles: [Role.ORG_ADMIN] },
          { organization: { aiAgentEnabled: false, aiAgentAllowedRoles: [] } },
        ),
      ),
    ).toThrow(/uitgeschakeld/);
  });

  it('allows a default-allowed role (BACKOFFICE) when roles list is empty', () => {
    const guard = production();
    expect(
      guard.canActivate(
        ctx(
          { roles: [Role.BACKOFFICE] },
          { organization: { aiAgentEnabled: true, aiAgentAllowedRoles: [] } },
        ),
      ),
    ).toBe(true);
  });

  it('blocks INSPECTEUR by default (not in the default role set)', () => {
    const guard = production();
    expect(() =>
      guard.canActivate(
        ctx(
          { roles: [Role.INSPECTEUR] },
          { organization: { aiAgentEnabled: true, aiAgentAllowedRoles: [] } },
        ),
      ),
    ).toThrow(/geen toegang/);
  });

  it('honours a per-org allowed-roles override (INSPECTEUR explicitly allowed)', () => {
    const guard = production();
    expect(
      guard.canActivate(
        ctx(
          { roles: [Role.INSPECTEUR] },
          { organization: { aiAgentEnabled: true, aiAgentAllowedRoles: [Role.INSPECTEUR] } },
        ),
      ),
    ).toBe(true);
  });

  it('blocks a role outside a restrictive per-org override', () => {
    const guard = production();
    expect(() =>
      guard.canActivate(
        ctx(
          { roles: [Role.MANAGER] },
          { organization: { aiAgentEnabled: true, aiAgentAllowedRoles: [Role.ORG_ADMIN] } },
        ),
      ),
    ).toThrow(ForbiddenException);
  });
});
