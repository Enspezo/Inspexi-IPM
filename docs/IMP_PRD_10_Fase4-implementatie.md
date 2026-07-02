# IMP_PRD_10 — Fase 4: Support-tickets

> Begeleidend bij `IMP_PRD_10_Helpsysteem.md`. **Fase 4** = tickets: aanmaken, reactie-thread, status; overzicht van **mijn tickets + org-tickets**; een **SUPERUSER-wachtrij** over alle organisaties; notificaties. Hiermee wordt de widget-footer uit Fase 3 functioneel.
> Vereist: **Fase 1** (modellen `SupportTicket`/`SupportTicketMessage`) gemerged. Fase 2/3 onafhankelijk maar aanbevolen.
> Beslissing-defaults uit het PRD: ticketnummering = per-org teller (numbering-module-variant als noot); MANAGER mag org-tickets **inzien**, bewerken alleen door ORG_ADMIN/SUPERUSER.

## Te wijzigen / nieuwe bestanden

**Backend (`apps/api`):**
- `prisma/schema.prisma` *(3 `NotificationType`-waarden)* + migratie
- `src/modules/support-tickets/support-tickets.module.ts` *(nieuw)*
- `src/modules/support-tickets/support-tickets.service.ts` *(nieuw)*
- `src/modules/support-tickets/support-tickets.controller.ts` *(nieuw)*
- `src/modules/support-tickets/dto/*` *(nieuw)*
- `src/app.module.ts` *(registreer `SupportTicketsModule`)*

**Frontend (`apps/portal`):**
- `src/types/index.ts` *(types)*
- `src/lib/status.ts` *(`SUPPORT_TICKET_STATUS`, `SUPPORT_TICKET_PRIORITY`)*
- `src/pages/help/hooks/use-support-tickets.ts` *(nieuw)*
- `src/pages/help/tickets/tickets-page.tsx` *(nieuw — `/help/tickets`)*
- `src/pages/help/tickets/ticket-detail-page.tsx` *(nieuw — `/help/tickets/:id`)*
- `src/pages/help/tickets/new-ticket-page.tsx` *(nieuw — `/help/tickets/new`)*
- `src/App.tsx` *(routes)* + `src/components/layout/sidebar.tsx` *(nav-children)*

---

## A. Backend

### A.1 NotificationType + migratie

Voeg toe aan `enum NotificationType` in `schema.prisma`:

```prisma
  SUPPORT_TICKET_AANGEMAAKT
  SUPPORT_TICKET_REACTIE
  SUPPORT_TICKET_STATUS
```

```bash
cd apps/api
npx prisma migrate dev --name add_support_ticket_notifications
```

### A.2 DTOs — `src/modules/support-tickets/dto/`

`dto/index.ts`:

```ts
export * from './create-support-ticket.dto';
export * from './add-ticket-message.dto';
export * from './update-support-ticket.dto';
export * from './list-support-tickets.dto';
```

`dto/create-support-ticket.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupportTicketCategory, SupportTicketPriority } from '@prisma/client';

export class CreateSupportTicketDto {
  @IsString() @MaxLength(200) subject!: string;
  @IsString() description!: string;
  @IsOptional() @IsEnum(SupportTicketCategory) category?: SupportTicketCategory;
  @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority;
  @IsOptional() @IsString() contextModule?: string;
  @IsOptional() @IsString() contextUrl?: string;
}
```

`dto/add-ticket-message.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AddTicketMessageDto {
  @IsString() body!: string;
  /** Alleen support/superuser: interne notitie, niet zichtbaar voor de klant. */
  @IsOptional() @IsBoolean() isInternal?: boolean;
}
```

`dto/update-support-ticket.dto.ts`:

```ts
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client';

export class UpdateSupportTicketDto {
  @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus;
  @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority;
  @IsOptional() @IsUUID() assignedToId?: string | null;
}
```

`dto/list-support-tickets.dto.ts`:

```ts
import { IsIn, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SupportTicketStatus } from '@prisma/client';

export class ListSupportTicketsDto {
  @IsOptional() @IsIn(['mine', 'org']) scope?: 'mine' | 'org';
  @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder?: 'asc' | 'desc';
}
```

### A.3 Service — `src/modules/support-tickets/support-tickets.service.ts`

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role, User, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, assertFound, orgScope } from '@/common';
import { MANAGEMENT_ROLES } from '@/common/auth/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSupportTicketDto, AddTicketMessageDto, UpdateSupportTicketDto, ListSupportTicketsDto } from './dto';

const userSelect = { id: true, firstName: true, lastName: true, email: true };

@Injectable()
export class SupportTicketsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private isSuperuser(u: User) { return u.roles.includes(Role.SUPERUSER); }
  private isManagement(u: User) { return u.roles.some((r) => (MANAGEMENT_ROLES as readonly Role[]).includes(r)); }

  // ── Lijst ──────────────────────────────────────────────────────────────────
  async findAll(user: User, q: ListSupportTicketsDto) {
    const { scope, status, page = 1, limit = 20, sortOrder = 'desc' } = q;

    const where: Prisma.SupportTicketWhereInput = { isDeleted: false, ...(status ? { status } : {}) };

    if (this.isSuperuser(user)) {
      // SUPERUSER zonder org → support-wachtrij over alle organisaties (orgScope geeft {})
      Object.assign(where, orgScope(user));
    } else {
      where.orgId = user.orgId!;
      // 'org' alleen voor management; anders (of bij 'mine') alleen eigen tickets
      if (scope !== 'org' || !this.isManagement(user)) {
        where.createdById = user.id;
      }
    }

    return paginate(this.prisma.supportTicket, {
      where,
      include: { createdBy: { select: userSelect }, assignedTo: { select: userSelect } },
      orderBy: { lastMessageAt: sortOrder === 'asc' ? 'asc' : 'desc' },
      page, limit,
    });
  }

  async stats(user: User) {
    const where: Prisma.SupportTicketWhereInput = { isDeleted: false };
    if (this.isSuperuser(user)) Object.assign(where, orgScope(user));
    else {
      where.orgId = user.orgId!;
      if (!this.isManagement(user)) where.createdById = user.id;
    }
    const grouped = await this.prisma.supportTicket.groupBy({ by: ['status'], where, _count: true });
    return grouped.reduce<Record<string, number>>((acc, g) => ((acc[g.status] = g._count as unknown as number), acc), {});
  }

  // ── Detail ──────────────────────────────────────────────────────────────────
  async findOne(user: User, id: string) {
    const ticket = assertFound(
      await this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          createdBy: { select: userSelect },
          assignedTo: { select: userSelect },
          messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: userSelect } } },
        },
      }),
      'Ticket',
    );
    this.assertCanView(user, ticket);
    // interne berichten verbergen voor niet-support
    if (!this.isSuperuser(user)) {
      ticket.messages = ticket.messages.filter((m) => !m.isInternal);
    }
    return ticket;
  }

  private assertCanView(user: User, ticket: { orgId: string; createdById: string }) {
    if (this.isSuperuser(user)) return;
    if (ticket.orgId !== user.orgId) throw new ForbiddenException('Geen toegang tot dit ticket');
    if (!this.isManagement(user) && ticket.createdById !== user.id) {
      throw new ForbiddenException('Geen toegang tot dit ticket');
    }
  }

  // ── Aanmaken ─────────────────────────────────────────────────────────────────
  async create(user: User, dto: CreateSupportTicketDto) {
    const orgId = user.orgId!; // tickets worden altijd onder de eigen org aangemaakt
    const ticket = await this.prisma.$transaction(async (tx) => {
      const last = await tx.supportTicket.findFirst({
        where: { orgId }, orderBy: { ticketNumber: 'desc' }, select: { ticketNumber: true },
      });
      return tx.supportTicket.create({
        data: {
          orgId,
          ticketNumber: (last?.ticketNumber ?? 0) + 1,
          subject: dto.subject,
          description: dto.description,
          category: dto.category ?? 'VRAAG',
          priority: dto.priority ?? 'NORMAAL',
          contextModule: dto.contextModule,
          contextUrl: dto.contextUrl,
          createdById: user.id,
          lastMessageAt: new Date(),
          messages: {
            create: [{ orgId, authorId: user.id, authorType: 'USER', body: dto.description }],
          },
        },
        include: { createdBy: { select: userSelect } },
      });
    });

    // Notify support (alle superusers)
    const supportIds = (await this.prisma.user.findMany({
      where: { roles: { has: Role.SUPERUSER } }, select: { id: true },
    })).map((u) => u.id);
    if (supportIds.length) {
      this.notifications.dispatch({
        type: NotificationType.SUPPORT_TICKET_AANGEMAAKT,
        orgId,
        recipientUserIds: supportIds,
        title: 'Nieuw supportticket',
        body: `#${ticket.ticketNumber} — ${ticket.subject}`,
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }
    return ticket;
  }

  // ── Reactie ──────────────────────────────────────────────────────────────────
  async addMessage(user: User, id: string, dto: AddTicketMessageDto) {
    const ticket = assertFound(await this.prisma.supportTicket.findUnique({ where: { id } }), 'Ticket');
    this.assertCanView(user, ticket);

    const isSupport = this.isSuperuser(user);
    if (dto.isInternal && !isSupport) throw new ForbiddenException('Alleen support mag interne notities plaatsen');

    const [message] = await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id, orgId: ticket.orgId, authorId: user.id,
          authorType: isSupport ? 'SUPPORT' : 'USER',
          body: dto.body, isInternal: dto.isInternal ?? false,
        },
        include: { author: { select: userSelect } },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          ...(isSupport && !ticket.firstResponseAt ? { firstResponseAt: new Date() } : {}),
          // klant reageert op 'wacht op klant' → terug naar 'in behandeling'
          ...(!isSupport && ticket.status === 'WACHT_OP_KLANT' ? { status: 'IN_BEHANDELING' as const } : {}),
        },
      }),
    ]);

    // Notify de andere partij
    const recipientIds = isSupport
      ? [ticket.createdById]
      : (ticket.assignedToId
          ? [ticket.assignedToId]
          : (await this.prisma.user.findMany({ where: { roles: { has: Role.SUPERUSER } }, select: { id: true } })).map((u) => u.id));
    const filtered = recipientIds.filter((rid) => rid && rid !== user.id);
    if (filtered.length && !dto.isInternal) {
      this.notifications.dispatch({
        type: NotificationType.SUPPORT_TICKET_REACTIE,
        orgId: ticket.orgId,
        recipientUserIds: filtered,
        title: `Reactie op ticket #${ticket.ticketNumber}`,
        body: ticket.subject,
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }
    return message;
  }

  // ── Status / prioriteit / toewijzing ─────────────────────────────────────────
  async update(user: User, id: string, dto: UpdateSupportTicketDto) {
    const ticket = assertFound(await this.prisma.supportTicket.findUnique({ where: { id } }), 'Ticket');
    // alleen ORG_ADMIN (eigen org) of SUPERUSER mogen bewerken
    const canEdit = this.isSuperuser(user) || (user.roles.includes(Role.ORG_ADMIN) && ticket.orgId === user.orgId);
    if (!canEdit) throw new ForbiddenException('Geen rechten om dit ticket te wijzigen');

    const data: Prisma.SupportTicketUpdateInput = {};
    if (dto.priority) data.priority = dto.priority;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId ? { connect: { id: dto.assignedToId } } : { disconnect: true };
    }
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'OPGELOST') data.resolvedAt = new Date();
      if (dto.status === 'GESLOTEN') data.closedAt = new Date();
    }

    const updated = await this.prisma.supportTicket.update({ where: { id }, data });

    if (dto.status && dto.status !== ticket.status) {
      this.notifications.dispatch({
        type: NotificationType.SUPPORT_TICKET_STATUS,
        orgId: ticket.orgId,
        recipientUserIds: [ticket.createdById].filter((rid) => rid !== user.id),
        title: `Ticket #${ticket.ticketNumber} bijgewerkt`,
        body: `Status: ${dto.status}`,
        entityType: 'SupportTicket',
        entityId: ticket.id,
      });
    }
    return updated;
  }
}
```

> **Ticketnummering:** de transactionele `max+1` is voldoende; de DB-constraint `@@unique([orgId, ticketNumber])` (Fase 1) vangt de zeldzame race af (vang de unieke-constraint-fout op en retry één keer). Wil je een configureerbaar prefix (`T-2026-0001`), vervang dan de teller door de bestaande `numbering`-module met `NumberingModel.SUPPORT_TICKET`.

### A.4 Controller — `src/modules/support-tickets/support-tickets.controller.ts`

```ts
import { Controller, Get, Post, Patch, Param, Query, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto, AddTicketMessageDto, UpdateSupportTicketDto, ListSupportTicketsDto } from './dto';

@ApiTags('Support tickets')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private tickets: SupportTicketsService) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Tickets (mine/org; SUPERUSER = wachtrij alle orgs)' })
  async findAll(@CurrentUser() user: User, @Query() q: ListSupportTicketsDto) {
    return { success: true, data: await this.tickets.findAll(user, q) };
  }

  @Get('stats')
  @Roles(...ALL_STAFF)
  async stats(@CurrentUser() user: User) {
    return { success: true, data: await this.tickets.stats(user) };
  }

  @Post()
  @Roles(...ALL_STAFF)
  async create(@CurrentUser() user: User, @Body() dto: CreateSupportTicketDto) {
    return { success: true, data: await this.tickets.create(user, dto) };
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  async findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.tickets.findOne(user, id) };
  }

  @Post(':id/messages')
  @Roles(...ALL_STAFF)
  async addMessage(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddTicketMessageDto) {
    return { success: true, data: await this.tickets.addMessage(user, id, dto) };
  }

  @Patch(':id')
  @Roles(...ALL_STAFF)   // service dwingt af: alleen ORG_ADMIN/SUPERUSER mogen muteren
  async update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupportTicketDto) {
    return { success: true, data: await this.tickets.update(user, id, dto) };
  }
}
```

> **Route-volgorde:** `GET stats` staat vóór `GET :id` zodat "stats" niet als id wordt geparset.

### A.5 Module + registratie

`src/modules/support-tickets/support-tickets.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
```

Voeg `SupportTicketsModule` toe aan de `imports`-array in `src/app.module.ts`.

> **Audit:** `SupportTicket` zit al in `AUDITED_ENTITIES` (Fase 1). Voeg in Fase 4 de NL-veldlabels toe in `apps/portal/src/lib/audit-field-labels.ts` voor `<AuditHistory entityType="SupportTicket" .../>` op de detailpagina.

---

## B. Frontend

### B.1 Types — `src/types/index.ts`

```ts
export enum SupportTicketStatus {
  NIEUW = 'NIEUW',
  IN_BEHANDELING = 'IN_BEHANDELING',
  WACHT_OP_KLANT = 'WACHT_OP_KLANT',
  OPGELOST = 'OPGELOST',
  GESLOTEN = 'GESLOTEN',
}
export enum SupportTicketPriority { LAAG = 'LAAG', NORMAAL = 'NORMAAL', HOOG = 'HOOG', URGENT = 'URGENT' }
export enum SupportTicketCategory { VRAAG='VRAAG', PROBLEEM='PROBLEEM', BUG='BUG', FEATURE_REQUEST='FEATURE_REQUEST', FACTUUR='FACTUUR', OVERIG='OVERIG' }

export interface SupportTicketMessage {
  id: string; ticketId: string; authorId: string | null;
  authorType: 'USER' | 'SUPPORT' | 'SYSTEM';
  body: string; isInternal: boolean; createdAt: string;
  author?: UserSummary;
}

export interface SupportTicket {
  id: string; orgId: string; ticketNumber: number;
  subject: string; description: string;
  status: SupportTicketStatus; priority: SupportTicketPriority; category: SupportTicketCategory;
  contextModule: string | null; contextUrl: string | null;
  createdById: string; assignedToId: string | null;
  firstResponseAt: string | null; resolvedAt: string | null; closedAt: string | null;
  lastMessageAt: string | null; createdAt: string; updatedAt: string;
  createdBy?: UserSummary; assignedTo?: UserSummary; messages?: SupportTicketMessage[];
}
```

### B.2 Status-maps — `src/lib/status.ts`

```ts
export const SUPPORT_TICKET_STATUS: StatusMap = {
  NIEUW:          { label: 'Nieuw',           classes: 'bg-blue-100 text-blue-800' },
  IN_BEHANDELING: { label: 'In behandeling',  classes: 'bg-amber-100 text-amber-800' },
  WACHT_OP_KLANT: { label: 'Wacht op klant',  classes: 'bg-purple-100 text-purple-800' },
  OPGELOST:       { label: 'Opgelost',        classes: 'bg-green-100 text-green-800' },
  GESLOTEN:       { label: 'Gesloten',        classes: 'bg-gray-100 text-gray-700' },
};

export const SUPPORT_TICKET_PRIORITY: StatusMap = {
  LAAG:    { label: 'Laag',    classes: 'bg-gray-100 text-gray-700' },
  NORMAAL: { label: 'Normaal', classes: 'bg-blue-100 text-blue-800' },
  HOOG:    { label: 'Hoog',    classes: 'bg-orange-100 text-orange-800' },
  URGENT:  { label: 'Urgent',  classes: 'bg-red-100 text-red-800' },
};
```

### B.3 Hooks — `src/pages/help/hooks/use-support-tickets.ts`

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { SupportTicket, SupportTicketMessage, PaginatedResponse } from '@/types';

interface TicketListParams { scope?: 'mine' | 'org'; status?: string; page?: number; limit?: number; }

export function useSupportTickets(params: TicketListParams = {}) {
  const q = new URLSearchParams();
  if (params.scope) q.set('scope', params.scope);
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return useQuery<PaginatedResponse<SupportTicket>>({
    queryKey: ['supportTickets', params],
    queryFn: () => apiClient.get<PaginatedResponse<SupportTicket>>(`/support-tickets${qs ? `?${qs}` : ''}`),
  });
}

export function useSupportTicket(id: string) {
  return useQuery<SupportTicket>({
    queryKey: ['supportTickets', id],
    queryFn: () => apiClient.get<SupportTicket>(`/support-tickets/${id}`),
    enabled: !!id,
  });
}

export function useTicketStats() {
  return useQuery<Record<string, number>>({
    queryKey: ['supportTickets', 'stats'],
    queryFn: () => apiClient.get<Record<string, number>>('/support-tickets/stats'),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SupportTicket>) => apiClient.post<SupportTicket>('/support-tickets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supportTickets'] }),
  });
}

export function useAddTicketMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; isInternal?: boolean }) =>
      apiClient.post<SupportTicketMessage>(`/support-tickets/${id}/messages`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supportTickets', id] }); },
  });
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SupportTicket>) => apiClient.patch<SupportTicket>(`/support-tickets/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supportTickets'] });
      qc.invalidateQueries({ queryKey: ['supportTickets', id] });
    },
  });
}
```

### B.4 Pagina's

`src/pages/help/tickets/tickets-page.tsx` (`/help/tickets` — mijn + org via tabs):

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, Card, Button, StatusBadge, Spinner, ErrorBox } from '@/components/ui';
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { useSupportTickets } from '../hooks/use-support-tickets';

const MGMT = ['SUPERUSER', 'ORG_ADMIN', 'MANAGER'];

export default function TicketsPage() {
  const { user } = useAuth();
  const canSeeOrg = user?.roles?.some((r) => MGMT.includes(r));
  const [tab, setTab] = useState<'mine' | 'org'>('mine');
  const scope = canSeeOrg ? tab : 'mine';
  const { data, isLoading, error } = useSupportTickets({ scope, limit: 50 });

  const tabs = canSeeOrg
    ? [{ key: 'mine', label: 'Mijn tickets' }, { key: 'org', label: 'Organisatie' }]
    : [{ key: 'mine', label: 'Mijn tickets' }];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Je tickets en de status ervan."
        actions={<Link to="/help/tickets/new"><Button>Nieuw ticket</Button></Link>}
      />
      <Tabs tabs={tabs} active={scope} onChange={(k) => setTab(k as 'mine' | 'org')} />

      {isLoading && <Spinner size="lg" />}
      {error && <ErrorBox>Kon tickets niet laden.</ErrorBox>}

      {data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">#</th><th>Onderwerp</th><th>Status</th><th>Prioriteit</th><th>Laatste activiteit</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr key={t.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 text-gray-500">#{t.ticketNumber}</td>
                  <td>
                    <Link to={`/help/tickets/${t.id}`} className="font-medium text-primary-600 hover:underline">{t.subject}</Link>
                  </td>
                  <td><StatusBadge map={SUPPORT_TICKET_STATUS} value={t.status} /></td>
                  <td><StatusBadge map={SUPPORT_TICKET_PRIORITY} value={t.priority} /></td>
                  <td className="text-gray-500">{formatDateTime(t.lastMessageAt)}</td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-gray-500">Geen tickets.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
```

`src/pages/help/tickets/new-ticket-page.tsx` (`/help/tickets/new` — leest `?module=` voor de context van de widget):

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Button, Input, Select, ErrorBox } from '@/components/ui';
import { useCreateTicket } from '../hooks/use-support-tickets';

const schema = z.object({
  subject: z.string().min(3, 'Onderwerp is verplicht'),
  description: z.string().min(5, 'Omschrijving is verplicht'),
  category: z.string().optional(),
  priority: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function NewTicketPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = useCreateTicket();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormData) {
    const ticket = await create.mutateAsync({
      ...values,
      contextModule: params.get('module') ?? undefined,
      contextUrl: document.referrer || undefined,
    } as any);
    navigate(`/help/tickets/${(ticket as any).id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Nieuw ticket" description="Beschrijf je vraag of probleem." />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Onderwerp</label>
            <Input {...register('subject')} />
            {errors.subject && <ErrorBox>{errors.subject.message}</ErrorBox>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Omschrijving</label>
            <textarea {...register('description')} rows={6} className="w-full rounded-md border border-gray-300 p-2" />
            {errors.description && <ErrorBox>{errors.description.message}</ErrorBox>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Categorie</label>
              <Select {...register('category')}>
                <option value="VRAAG">Vraag</option><option value="PROBLEEM">Probleem</option>
                <option value="BUG">Bug</option><option value="FEATURE_REQUEST">Wens</option>
                <option value="FACTUUR">Factuur</option><option value="OVERIG">Overig</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Prioriteit</label>
              <Select {...register('priority')}>
                <option value="LAAG">Laag</option><option value="NORMAAL">Normaal</option>
                <option value="HOOG">Hoog</option><option value="URGENT">Urgent</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/help/tickets')}>Annuleren</Button>
            <Button type="submit" isLoading={create.isPending}>Versturen</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
```

`src/pages/help/tickets/ticket-detail-page.tsx` (`/help/tickets/:id` — thread + reactie + admin-acties):

```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { Card, Button, Select, StatusBadge, Spinner, ErrorBox } from '@/components/ui';
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { useSupportTicket, useAddTicketMessage, useUpdateTicket } from '../hooks/use-support-tickets';

const CAN_EDIT = ['SUPERUSER', 'ORG_ADMIN'];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: ticket, isLoading, error } = useSupportTicket(id!);
  const addMessage = useAddTicketMessage(id!);
  const update = useUpdateTicket(id!);
  const [reply, setReply] = useState('');

  if (isLoading) return <Spinner size="lg" />;
  if (error || !ticket) return <ErrorBox>Ticket niet gevonden.</ErrorBox>;

  const canEdit = user?.roles?.some((r) => CAN_EDIT.includes(r));

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="SupportTicket" entityId={id} />}>
      <div className="space-y-6">
        <Link to="/help/tickets" className="text-sm text-gray-500 hover:underline">← Terug naar tickets</Link>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">#{ticket.ticketNumber} — {ticket.subject}</h1>
          <div className="flex gap-2">
            <StatusBadge map={SUPPORT_TICKET_STATUS} value={ticket.status} />
            <StatusBadge map={SUPPORT_TICKET_PRIORITY} value={ticket.priority} />
          </div>
        </div>

        {canEdit && (
          <Card>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Status</label>
                <Select value={ticket.status} onChange={(e) => update.mutate({ status: e.target.value as any })}>
                  {Object.keys(SUPPORT_TICKET_STATUS).map((s) => <option key={s} value={s}>{SUPPORT_TICKET_STATUS[s].label}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Prioriteit</label>
                <Select value={ticket.priority} onChange={(e) => update.mutate({ priority: e.target.value as any })}>
                  {Object.keys(SUPPORT_TICKET_PRIORITY).map((p) => <option key={p} value={p}>{SUPPORT_TICKET_PRIORITY[p].label}</option>)}
                </Select>
              </div>
            </div>
          </Card>
        )}

        {/* Thread */}
        <div className="space-y-3">
          {ticket.messages?.map((m) => (
            <Card key={m.id} className={m.authorType === 'SUPPORT' ? 'border-l-4 border-primary-400' : ''}>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>{m.author ? `${m.author.firstName} ${m.author.lastName}` : 'Systeem'} · {m.authorType === 'SUPPORT' ? 'Support' : 'Klant'}{m.isInternal ? ' · intern' : ''}</span>
                <span>{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{m.body}</p>
            </Card>
          ))}
        </div>

        {/* Reactie */}
        <Card>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4}
            placeholder="Typ een reactie…" className="w-full rounded-md border border-gray-300 p-2" />
          <div className="mt-2 flex justify-end">
            <Button
              isLoading={addMessage.isPending}
              onClick={async () => { if (reply.trim()) { await addMessage.mutateAsync({ body: reply }); setReply(''); } }}
            >Reactie versturen</Button>
          </div>
        </Card>
      </div>
    </DetailPageLayout>
  );
}
```

### B.5 Routing + sidebar

`src/App.tsx` — lazy imports + routes:

```tsx
const TicketsPage       = lazy(() => import('@/pages/help/tickets/tickets-page'));
const NewTicketPage     = lazy(() => import('@/pages/help/tickets/new-ticket-page'));
const TicketDetailPage  = lazy(() => import('@/pages/help/tickets/ticket-detail-page'));
```

```tsx
<Route path="/help/tickets" element={<TicketsPage />} />
<Route path="/help/tickets/new" element={<NewTicketPage />} />
<Route path="/help/tickets/:id" element={<TicketDetailPage />} />
```

> Zet `/help/tickets/new` **vóór** `/help/tickets/:id` zodat "new" niet als id matcht.

`src/components/layout/sidebar.tsx` — voeg children toe aan het "Help & support"-item uit Fase 3:

```tsx
  children: [
    { to: '/help', label: 'Helpcentrum' },
    { to: '/help/tickets', label: 'Mijn tickets' },
  ],
```

---

## C. Verificatie & Definition of Done

```bash
cd apps/api
pnpm test                              # support-tickets.service: nummering, zichtbaarheid, status-overgangen, dispatch
pnpm test:e2e -- support-tickets       # CRUD + thread + notificatie
pnpm test:e2e -- cross-tenant          # org A ziet/muteert tickets van org B niet (403/404)

# root
npx turbo run build
```

**Smoketests (browser):**
1. Backoffice maakt ticket via `/help/tickets/new` (ook via widget-footer met `?module=quotes`) → verschijnt onder "Mijn tickets".
2. ORG_ADMIN ziet "Organisatie"-tab met álle org-tickets; INSPECTEUR ziet alleen eigen.
3. ORG_ADMIN wijzigt status/prioriteit; klant krijgt notificatie.
4. SUPERUSER op `mijn.localhost` ziet de wachtrij over alle orgs; reageert → klant krijgt notificatie; interne notitie is voor de klant verborgen.
5. Klant reageert op "Wacht op klant" → status springt naar "In behandeling".

**Klaar wanneer:**

- [ ] Per-org oplopend `ticketNumber`; uniek-constraint dekt races.
- [ ] Zichtbaarheid klopt: mine/org/superuser-wachtrij; cross-tenant e2e groen.
- [ ] Alleen ORG_ADMIN/SUPERUSER muteren (status/prioriteit/assignee); thread-reacties door betrokkenen.
- [ ] Interne notities verborgen voor niet-support.
- [ ] Notificaties bij aanmaken/reactie/status; geen notificatie naar de actor zelf.
- [ ] Widget-footer (`/help/tickets/new?module=…`) is nu functioneel; `contextModule` wordt opgeslagen.
- [ ] `npx turbo run build` groen.

**Commit:** `feat: implement IMP_PRD-10 — fase 4 support-tickets (module, overzicht, thread, wachtrij, notificaties)`

> Volgende stap (Fase 5): support-toegang toggle + log + JIT-expiry + access-logging + UI in Organisatie-instellingen. Zie `IMP_PRD_10_Helpsysteem.md` §5.4, §6.3.
