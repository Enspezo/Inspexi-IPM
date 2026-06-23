# IMP_PRD_10 — Fase 5: Support-toegang (toggle, log, JIT-expiry & access-logging)

> Begeleidend bij `IMP_PRD_10_Helpsysteem.md`. **Fase 5** = de organisatie geeft InspeXi-support **expliciete, geauditeerde toestemming** via een toggle. SUPERUSER houdt technisch altijd toegang; de toggle legt consent + audittrail vast, met optionele **JIT-expiry** en logging van **daadwerkelijke inzage**.
> Vereist: **Fase 1** (`Organization.supportAccessEnabled/ExpiresAt`, `SupportAccessLog`) gemerged.

## Te wijzigen / nieuwe bestanden

**Backend (`apps/api`):**
- `src/modules/organizations/support-access.service.ts` *(nieuw)*
- `src/modules/organizations/support-access.scheduler.ts` *(nieuw — JIT-expiry cron)*
- `src/modules/organizations/dto/support-access.dto.ts` *(nieuw)*
- `src/modules/organizations/organizations.controller.ts` *(3 endpoints)*
- `src/modules/organizations/organizations.module.ts` *(providers)*
- `src/common/interceptors/support-access.interceptor.ts` *(nieuw — ACCESSED-logging)*
- `src/app.module.ts` *(registreer interceptor als `APP_INTERCEPTOR`)*

**Frontend (`apps/portal`):**
- `src/lib/status.ts` *(`SUPPORT_ACCESS_ACTION`)*
- `src/pages/organization/hooks/use-support-access.ts` *(nieuw)*
- `src/pages/organization/components/support-access-section.tsx` *(nieuw)*
- `src/pages/organization/organization-settings-page.tsx` *(sectie inhaken)*

---

## A. Backend

### A.1 DTO — `src/modules/organizations/dto/support-access.dto.ts`

```ts
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SetSupportAccessDto {
  @IsBoolean() enabled!: boolean;
  /** Optionele JIT-vervaltijd in uren (bv. 24). Weglaten = geen auto-expiry. */
  @IsOptional() @IsInt() @Min(1) @Max(720) expiresInHours?: number;
  @IsOptional() @IsString() note?: string;
}
```

Exporteer in `dto/index.ts` (indien aanwezig) of importeer direct.

### A.2 Service — `src/modules/organizations/support-access.service.ts`

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role, SupportAccessAction, User } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, assertFound } from '@/common';
import { SetSupportAccessDto } from './dto/support-access.dto';

@Injectable()
export class SupportAccessService {
  constructor(private prisma: PrismaService) {}

  private assertScope(user: User, orgId: string) {
    if (user.roles.includes(Role.SUPERUSER)) return;
    if (user.orgId !== orgId) throw new ForbiddenException('Geen toegang tot deze organisatie');
  }

  async getStatus(user: User, orgId: string) {
    this.assertScope(user, orgId);
    const org = assertFound(
      await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { supportAccessEnabled: true, supportAccessExpiresAt: true },
      }),
      'Organisatie',
    );
    return org;
  }

  async setAccess(user: User, orgId: string, dto: SetSupportAccessDto, ip?: string, userAgent?: string) {
    this.assertScope(user, orgId);
    const expiresAt = dto.enabled && dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 3_600_000)
      : null;

    const [org] = await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: orgId },
        data: { supportAccessEnabled: dto.enabled, supportAccessExpiresAt: expiresAt },
        select: { supportAccessEnabled: true, supportAccessExpiresAt: true },
      }),
      this.prisma.supportAccessLog.create({
        data: {
          orgId,
          action: dto.enabled ? SupportAccessAction.ENABLED : SupportAccessAction.DISABLED,
          performedById: user.id,
          performedByRole: user.roles[0] ?? null,
          ip, userAgent, note: dto.note,
        },
      }),
    ]);
    return org;
  }

  async listLogs(user: User, orgId: string, page = 1, limit = 20) {
    this.assertScope(user, orgId);
    return paginate(this.prisma.supportAccessLog, {
      where: { orgId } as Prisma.SupportAccessLogWhereInput,
      include: { performedBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      page, limit,
    });
  }

  /** Schrijft een ACCESSED-regel (aangeroepen door de interceptor, al gethrottled). */
  async logAccess(orgId: string, userId: string, ip?: string) {
    await this.prisma.supportAccessLog.create({
      data: { orgId, action: SupportAccessAction.ACCESSED, performedById: userId, performedByRole: Role.SUPERUSER, ip },
    });
  }

  /** JIT-expiry: zet verlopen grants uit en logt EXPIRED. Aangeroepen door de scheduler. */
  async expireGrants(now = new Date()): Promise<number> {
    const expired = await this.prisma.organization.findMany({
      where: { supportAccessEnabled: true, supportAccessExpiresAt: { not: null, lt: now } },
      select: { id: true },
    });
    for (const org of expired) {
      await this.prisma.$transaction([
        this.prisma.organization.update({
          where: { id: org.id },
          data: { supportAccessEnabled: false, supportAccessExpiresAt: null },
        }),
        this.prisma.supportAccessLog.create({
          data: { orgId: org.id, action: SupportAccessAction.EXPIRED, note: 'Automatisch verlopen (JIT).' },
        }),
      ]);
    }
    return expired.length;
  }
}
```

### A.3 Scheduler — `src/modules/organizations/support-access.scheduler.ts`

Spiegelt `quotes/quote-scheduler.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportAccessService } from './support-access.service';

@Injectable()
export class SupportAccessScheduler {
  private readonly logger = new Logger(SupportAccessScheduler.name);
  constructor(private supportAccess: SupportAccessService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expire(): Promise<void> {
    const count = await this.supportAccess.expireGrants();
    if (count > 0) this.logger.log(`Support-toegang verlopen voor ${count} organisatie(s).`);
  }
}
```

### A.4 Controller-endpoints — in `OrganizationsController`

Importeer `SupportAccessService`, `SetSupportAccessDto`, en NestJS' `Ip`, `Headers`. Voeg toe (param-routes; zorg dat ze niet botsen met bestaande `:id`-routes — ze hebben een extra segment, dus OK):

```ts
import { Ip, Headers } from '@nestjs/common';
import { ORG_ADMINS } from '@/common/auth/roles';
import { SupportAccessService } from './support-access.service';
import { SetSupportAccessDto } from './dto/support-access.dto';
// constructor: + private supportAccess: SupportAccessService

@Get(':id/support-access')
@Roles(...ORG_ADMINS)
@ApiOperation({ summary: 'Status support-toegang' })
async getSupportAccess(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
  return { success: true, data: await this.supportAccess.getStatus(user, id) };
}

@Patch(':id/support-access')
@Roles(...ORG_ADMINS)
@ApiOperation({ summary: 'Support-toegang in-/uitschakelen (gelogd)' })
async setSupportAccess(
  @CurrentUser() user: User,
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: SetSupportAccessDto,
  @Ip() ip: string,
  @Headers('user-agent') userAgent: string,
) {
  return { success: true, data: await this.supportAccess.setAccess(user, id, dto, ip, userAgent) };
}

@Get(':id/support-access/logs')
@Roles(...ORG_ADMINS)
@ApiOperation({ summary: 'Support-toegang logboek' })
async supportAccessLogs(
  @CurrentUser() user: User,
  @Param('id', ParseUUIDPipe) id: string,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return { success: true, data: await this.supportAccess.listLogs(user, id, Number(page) || 1, Number(limit) || 20) };
}
```

### A.5 Module — `OrganizationsModule`

Voeg `SupportAccessService` + `SupportAccessScheduler` toe aan `providers` (en exporteer `SupportAccessService` zodat de interceptor hem kan injecteren):

```ts
  providers: [OrganizationsService, SupportAccessService, SupportAccessScheduler],
  exports: [OrganizationsService, SupportAccessService],
```

### A.6 Access-logging interceptor — `src/common/interceptors/support-access.interceptor.ts`

Logt wanneer een **SUPERUSER** een org-subdomein bekijkt terwijl support-toegang **aanstaat**. Leest de org uit de **al gecachete** `TenantContext` (geen extra DB-read), throttelt in-memory (1×/dag per org+superuser).

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Role } from '@prisma/client';
import { SupportAccessService } from '@/modules/organizations/support-access.service';

@Injectable()
export class SupportAccessInterceptor implements NestInterceptor {
  private readonly seen = new Map<string, string>(); // key → yyyy-mm-dd

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
        const ip = req.ip;
        // fire-and-forget; blokkeert de request niet
        void this.supportAccess.logAccess(tenant.orgId, user.id, ip).catch(() => undefined);
      }
    }
    return next.handle();
  }
}
```

Registreer globaal in `src/app.module.ts` (bij de overige `APP_*`-providers):

```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SupportAccessInterceptor } from '@/common/interceptors/support-access.interceptor';
// in providers:
    { provide: APP_INTERCEPTOR, useClass: SupportAccessInterceptor },
```

> De interceptor heeft `SupportAccessService` nodig → zorg dat `OrganizationsModule` die exporteert (A.5) en in `app.module.ts` geïmporteerd is (dat is hij al). De in-memory throttle reset bij herstart — acceptabel; voor strakke garanties later naar een `lastAccessLoggedAt`-veld of Redis.

---

## B. Frontend

### B.1 Status-map — `src/lib/status.ts`

```ts
export const SUPPORT_ACCESS_ACTION: StatusMap = {
  ENABLED:  { label: 'Ingeschakeld', classes: 'bg-green-100 text-green-800' },
  DISABLED: { label: 'Uitgeschakeld', classes: 'bg-gray-100 text-gray-700' },
  EXPIRED:  { label: 'Verlopen',     classes: 'bg-amber-100 text-amber-800' },
  ACCESSED: { label: 'Ingezien',     classes: 'bg-blue-100 text-blue-800' },
};
```

### B.2 Hooks — `src/pages/organization/hooks/use-support-access.ts`

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse } from '@/types';

export interface SupportAccessStatus { supportAccessEnabled: boolean; supportAccessExpiresAt: string | null; }
export interface SupportAccessLog {
  id: string; action: 'ENABLED' | 'DISABLED' | 'EXPIRED' | 'ACCESSED';
  performedByRole: string | null; ip: string | null; note: string | null; createdAt: string;
  performedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export function useSupportAccess(orgId: string) {
  return useQuery<SupportAccessStatus>({
    queryKey: ['supportAccess', orgId],
    queryFn: () => apiClient.get<SupportAccessStatus>(`/organizations/${orgId}/support-access`),
    enabled: !!orgId,
  });
}

export function useSetSupportAccess(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean; expiresInHours?: number; note?: string }) =>
      apiClient.patch<SupportAccessStatus>(`/organizations/${orgId}/support-access`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supportAccess', orgId] });
      qc.invalidateQueries({ queryKey: ['supportAccessLogs', orgId] });
    },
  });
}

export function useSupportAccessLogs(orgId: string) {
  return useQuery<PaginatedResponse<SupportAccessLog>>({
    queryKey: ['supportAccessLogs', orgId],
    queryFn: () => apiClient.get<PaginatedResponse<SupportAccessLog>>(`/organizations/${orgId}/support-access/logs?limit=20`),
    enabled: !!orgId,
  });
}
```

### B.3 Sectie-component — `src/pages/organization/components/support-access-section.tsx`

```tsx
import { useState } from 'react';
import { Card, Button, Select, StatusBadge, Spinner, useConfirm } from '@/components/ui';
import { SUPPORT_ACCESS_ACTION } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useSupportAccess, useSetSupportAccess, useSupportAccessLogs } from '../hooks/use-support-access';

export function SupportAccessSection({ orgId }: { orgId: string }) {
  const confirm = useConfirm();
  const { data: status, isLoading } = useSupportAccess(orgId);
  const { data: logs } = useSupportAccessLogs(orgId);
  const setAccess = useSetSupportAccess(orgId);
  const [hours, setHours] = useState('24');

  if (isLoading) return <Spinner size="sm" />;
  const enabled = status?.supportAccessEnabled ?? false;

  async function toggle() {
    if (enabled) {
      if (await confirm({ title: 'Support-toegang intrekken?', message: 'InspeXi-support kan je organisatie dan niet meer met toestemming inzien.', confirmLabel: 'Intrekken' })) {
        setAccess.mutate({ enabled: false });
      }
    } else {
      setAccess.mutate({ enabled: true, expiresInHours: Number(hours) || undefined });
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Support-toegang</h3>
          <p className="mt-1 max-w-prose text-sm text-gray-600">
            Geef InspeXi-support toestemming om je organisatie in te zien voor hulp. Je kunt dit altijd intrekken; elke wijziging en inzage wordt vastgelegd in het logboek hieronder.
          </p>
        </div>
        <StatusBadge map={SUPPORT_ACCESS_ACTION} value={enabled ? 'ENABLED' : 'DISABLED'} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {!enabled && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Automatisch verlopen na</label>
            <Select value={hours} onChange={(e) => setHours(e.target.value)}>
              <option value="4">4 uur</option>
              <option value="24">24 uur</option>
              <option value="72">3 dagen</option>
              <option value="">Niet automatisch</option>
            </Select>
          </div>
        )}
        <Button variant={enabled ? 'danger' : 'primary'} isLoading={setAccess.isPending} onClick={toggle}>
          {enabled ? 'Toegang intrekken' : 'Toegang verlenen'}
        </Button>
        {enabled && status?.supportAccessExpiresAt && (
          <span className="text-sm text-gray-500">Verloopt: {formatDateTime(status.supportAccessExpiresAt)}</span>
        )}
      </div>

      {/* Logboek */}
      <div className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Logboek</h4>
        {!logs || logs.data.length === 0 ? (
          <p className="text-sm text-gray-500">Nog geen gebeurtenissen.</p>
        ) : (
          <ul className="divide-y text-sm">
            {logs.data.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <StatusBadge map={SUPPORT_ACCESS_ACTION} value={l.action} />
                  <span className="text-gray-700">
                    {l.performedBy ? `${l.performedBy.firstName} ${l.performedBy.lastName}` : 'Systeem'}
                    {l.ip ? ` · ${l.ip}` : ''}{l.note ? ` · ${l.note}` : ''}
                  </span>
                </span>
                <span className="text-gray-400">{formatDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
```

### B.4 Inhaken in de instellingenpagina

In `src/pages/organization/organization-settings-page.tsx`, render de sectie (de pagina kent het org-id via de auth/tenant-context — gebruik dezelfde bron als de bestaande secties):

```tsx
import { SupportAccessSection } from './components/support-access-section';
// …binnen de pagina, na de bestaande instellingen-cards:
<SupportAccessSection orgId={orgId} />
```

> Haal `orgId` op zoals de pagina dat al doet (bv. `useAuth().user.orgId` of de bestaande `useOrganization`-hook). Voor SUPERUSER op een org-subdomein is dat de bekeken org.

---

## C. Verificatie & Definition of Done

```bash
cd apps/api
pnpm test                                   # support-access.service: toggle schrijft log, expiry, scope-guard
pnpm test:e2e -- organizations              # endpoints + cross-org (org A kan support-access van org B niet zetten/lezen → 403)

# root
npx turbo run build
```

**Smoketests (browser):**
1. ORG_ADMIN op `inspexidemo.localhost:5173` → Organisatie → Instellingen → "Toegang verlenen" (24u) → status wordt **Ingeschakeld**, log toont een **ENABLED**-regel met naam/IP.
2. SUPERUSER opent `inspexidemo.localhost:5173` (org-subdomein) terwijl toegang aanstaat → er verschijnt (max. 1×/dag) een **ACCESSED**-regel in het logboek.
3. Zet `supportAccessExpiresAt` in het verleden (of wacht) → de cron zet de toggle uit en logt **EXPIRED**.
4. ORG_ADMIN trekt toegang in → **DISABLED**-regel; bij superuser-inzage zonder actieve grant kun je in de UI later een waarschuwingsbanner tonen (optioneel).
5. Een ORG_ADMIN van een andere org kan deze endpoints niet aanroepen (403).

**Klaar wanneer:**

- [ ] `GET/PATCH /organizations/:id/support-access` + `/logs` werken; scope-guard dwingt eigen org af (SUPERUSER mag alle).
- [ ] Toggle schrijft `ENABLED`/`DISABLED`-log met `performedById`, rol, IP en optionele reden.
- [ ] JIT-expiry-cron zet verlopen grants uit en logt `EXPIRED`.
- [ ] Interceptor logt `ACCESSED` bij superuser-inzage onder actieve grant, gethrottled (1×/dag), zonder extra DB-reads voor de org-status (uit `TenantContext`-cache).
- [ ] Instellingen-UI toont toggle, vervaltijd en logboek met badges.
- [ ] `npx turbo run build` groen.

**Commit:** `feat: implement IMP_PRD-10 — fase 5 support-toegang (toggle, log, JIT-expiry, access-logging)`

---

## Afronding IMP_PRD-10

Met Fase 1–5 is het helpsysteem compleet conform het PRD: KB (globaal + org-specifiek), zwevend paneel met contextuele suggesties, chat-placeholder met haak, tickets (mijn/org/wachtrij) en geauditeerde support-toegang.

**Fase 6 (later, apart):** RAG-chatbot op de KB (de `onSendMessage`-haak → `POST /help/chat` met embeddings + Anthropic-key), SLA-timers/first-response-targets, "was dit nuttig"-analytics + no-result-zoekrapport, e-mail-naar-ticket. Zie `IMP_PRD_10_Helpsysteem.md` §13.
