# IMP_PRD_10 — Fase 3: Help-widget, contextuele suggesties & chat-placeholder

> Begeleidend bij `IMP_PRD_10_Helpsysteem.md`. **Fase 3** = het zwevende help-paneel dat overal te openen is, met **contextuele KB-suggesties** voor de huidige view (max. 5 + "Meer") en een **chat-placeholder met architectuur-haak** voor de latere bot.
> Vereist: **Fase 1 + Fase 2** gemerged (KB-modellen + `HelpService`).
> Tickets-routes komen in **Fase 4**; de widget-footer linkt er alvast naartoe (stub tot Fase 4).

## Te wijzigen / nieuwe bestanden

**Backend (`apps/api`):**
- `src/modules/help/help.service.ts` *(methode `getContextual` toevoegen)*
- `src/modules/help/help.controller.ts` *(endpoint `GET /help/articles/contextual`)*
- `src/modules/help/dto/contextual-help.dto.ts` *(nieuw)* + export in `dto/index.ts`

**Frontend (`apps/portal`):**
- `src/lib/help-module-map.ts` *(nieuw — route → moduleKey)*
- `src/providers/help-provider.tsx` *(nieuw)*
- `src/components/help/help-widget.tsx` *(nieuw — zwevende knop + paneel)*
- `src/components/help/help-suggestions.tsx` *(nieuw — max 5 + "Meer")*
- `src/components/help/help-chat-panel.tsx` *(nieuw — placeholder + haak)*
- `src/components/help/index.ts` *(barrel)*
- `src/pages/help/hooks/use-help.ts` *(hook `useContextualArticles`)*
- `src/main.tsx` *(`HelpProvider` in de provider-stack)*
- `src/components/layout/app-layout.tsx` *(`<HelpWidget />` renderen)*

---

## A. Backend — contextueel endpoint

### A.1 DTO — `src/modules/help/dto/contextual-help.dto.ts`

```ts
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ContextualHelpDto {
  /** moduleKey van de huidige view, bv. "quotes". */
  @IsOptional() @IsString() module?: string;
  /** optionele vrije zoekterm (typt de gebruiker in het paneel). */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
```

Voeg toe aan `dto/index.ts`:

```ts
export * from './contextual-help.dto';
```

### A.2 Service — methode in `HelpService`

Voeg toe aan `src/modules/help/help.service.ts` (gebruikt de bestaande `visibilityWhere`):

```ts
import { Prisma } from '@prisma/client';

// ── Contextuele suggesties ───────────────────────────────────────────────────
async getContextual(
  user: User,
  moduleKey?: string,
  q?: string,
  limit = 20,
): Promise<{ items: any[]; total: number }> {
  const include = { category: { select: { id: true, name: true, slug: true } } };
  const base: Prisma.HelpArticleWhereInput = { status: 'PUBLISHED', ...this.visibilityWhere(user) };

  // 1) Primair: artikelen die expliciet bij deze module horen (+ optionele tekstmatch)
  const primaryWhere: Prisma.HelpArticleWhereInput = {
    ...base,
    ...(moduleKey ? { moduleKeys: { hasSome: [moduleKey] } } : {}),
    ...(q
      ? { OR: [
          { title:   { contains: q, mode: 'insensitive' } },
          { excerpt: { contains: q, mode: 'insensitive' } },
          { tags:    { hasSome: [q.toLowerCase()] } },
        ] }
      : {}),
  };

  let items = await this.prisma.helpArticle.findMany({ where: primaryWhere, include, take: 50 });

  // 2) Fallback: nooit een leeg paneel — toon meest-bekeken artikelen binnen scope
  if (items.length === 0) {
    items = await this.prisma.helpArticle.findMany({
      where: base,
      include,
      orderBy: [{ viewCount: 'desc' }, { order: 'asc' }],
      take: limit,
    });
  }

  // 3) Rangschikking: org-specifiek vóór globaal, daarna meest bekeken / volgorde
  items.sort((a, b) => {
    const orgRank = Number(b.orgId !== null) - Number(a.orgId !== null);
    if (orgRank !== 0) return orgRank;
    if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
    return a.order - b.order;
  });

  return { items: items.slice(0, limit), total: items.length };
}
```

> **Waarom geen raw SQL hier?** Prisma's `moduleKeys: { hasSome: [...] }` benut de GIN-index uit Fase 1 native. Typo-tolerant zoeken (pg_trgm `similarity()`) is een **optionele upgrade** voor de `q`-tak: vervang de `contains`-`OR` door een `$queryRaw` met `WHERE title % :q ORDER BY similarity(title, :q) DESC`. Niet nodig voor de moduleKey-gedreven kern.

### A.3 Controller — endpoint in `HelpController`

Voeg toe aan `src/modules/help/help.controller.ts` (importeer `ContextualHelpDto`). **Plaats deze route vóór** `@Get('articles/:slug')` zodat `articles/contextual` niet als slug wordt opgevat:

```ts
import { ContextualHelpDto } from './dto';

@Get('articles/contextual')
@Roles(...ALL_STAFF)
@ApiOperation({ summary: 'Contextuele KB-suggesties voor de huidige view' })
async contextual(@CurrentUser() user: User, @Query() q: ContextualHelpDto) {
  const data = await this.help.getContextual(user, q.module, q.q, q.limit ?? 20);
  return { success: true, data };
}
```

> **Let op route-volgorde** (NestJS): `GET help/articles/contextual` moet bóven `GET help/articles/:slug` in de controller staan, anders matcht `:slug` op "contextual".

---

## B. Frontend

### B.1 Route → moduleKey — `src/lib/help-module-map.ts`

```ts
/** Prefix → moduleKey. Langste matchende prefix wint; geen match → 'general'. */
export const HELP_MODULE_MAP: { prefix: string; moduleKey: string }[] = [
  { prefix: '/quotes',       moduleKey: 'quotes' },
  { prefix: '/requests',     moduleKey: 'requests' },
  { prefix: '/contacts',     moduleKey: 'contacts' },
  { prefix: '/planning',     moduleKey: 'planning' },
  { prefix: '/work-orders',  moduleKey: 'planning' },
  { prefix: '/tasks',        moduleKey: 'tasks' },
  { prefix: '/documents',    moduleKey: 'documents' },
  { prefix: '/products',     moduleKey: 'products' },
  { prefix: '/price-tables', moduleKey: 'products' },
  { prefix: '/projects',     moduleKey: 'projects' },
  { prefix: '/inspections',  moduleKey: 'inspections' },
  { prefix: '/organization', moduleKey: 'organization' },
  { prefix: '/dashboard',    moduleKey: 'dashboard' },
  { prefix: '/help',         moduleKey: 'help' },
];

export function resolveModuleKey(pathname: string): string {
  const match = HELP_MODULE_MAP
    .filter((m) => pathname.startsWith(m.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.moduleKey ?? 'general';
}
```

### B.2 Provider — `src/providers/help-provider.tsx`

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveModuleKey } from '@/lib/help-module-map';

interface HelpContextValue {
  isOpen: boolean;
  moduleKey: string;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { pathname } = useLocation();
  const moduleKey = useMemo(() => resolveModuleKey(pathname), [pathname]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(() => ({ isOpen, moduleKey, open, close, toggle }), [isOpen, moduleKey, open, close, toggle]);
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp must be used within HelpProvider');
  return ctx;
}
```

### B.3 Hook — toevoegen aan `src/pages/help/hooks/use-help.ts`

```ts
import type { HelpArticle } from '@/types';

interface ContextualResult { items: HelpArticle[]; total: number; }

export function useContextualArticles(moduleKey: string, q?: string, enabled = true) {
  const params = new URLSearchParams();
  if (moduleKey) params.set('module', moduleKey);
  if (q) params.set('q', q);
  const qs = params.toString();
  return useQuery<ContextualResult>({
    queryKey: ['help', 'contextual', moduleKey, q ?? ''],
    queryFn: () => apiClient.get<ContextualResult>(`/help/articles/contextual${qs ? `?${qs}` : ''}`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
```

### B.4 Suggesties — `src/components/help/help-suggestions.tsx`

Toont maximaal 5; bij meer een **"Meer"**-knop die de rest uitklapt (best-practice: nooit leeg dankzij de service-fallback).

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useContextualArticles } from '@/pages/help/hooks/use-help';

const MAX_VISIBLE = 5;

export function HelpSuggestions({ moduleKey, onNavigate }: { moduleKey: string; onNavigate?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useContextualArticles(moduleKey);

  if (isLoading) return <div className="py-4"><Spinner size="sm" /></div>;
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - MAX_VISIBLE;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Relevante artikelen</h3>
      <ul className="space-y-1">
        {visible.map((a) => (
          <li key={a.id}>
            <Link
              to={`/help/article/${a.slug}`}
              onClick={onNavigate}
              className="block rounded px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 hover:text-primary-600"
            >
              {a.title}
              {a.orgId && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">eigen org</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!expanded && hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-1 px-2 text-sm font-medium text-primary-600 hover:underline">
          Meer ({hiddenCount})
        </button>
      )}
    </div>
  );
}
```

### B.5 Chat-placeholder — `src/components/help/help-chat-panel.tsx`

Bruikbaar maar zonder bot: lokale berichten + canned antwoord dat naar artikelen/ticket leidt. **`onSendMessage` is de centrale haak** voor de latere RAG-bot (zie `IMP_PRD_10_Helpsysteem.md` §9).

```tsx
import { useState } from 'react';
import { Button, Input } from '@/components/ui';

interface ChatMsg { id: string; from: 'user' | 'bot'; text: string; }

export function HelpChatPanel({ moduleKey }: { moduleKey: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');

  // HAAK: vervang dit in een latere fase door een call naar POST /help/chat (RAG over de KB).
  async function onSendMessage(text: string) {
    const userMsg: ChatMsg = { id: crypto.randomUUID(), from: 'user', text };
    const botMsg: ChatMsg = {
      id: crypto.randomUUID(),
      from: 'bot',
      text: 'Bedankt voor je vraag! Bekijk hierboven de relevante artikelen. Lost dat het niet op? Maak dan een ticket aan via de knop onderaan.',
    };
    setMessages((m) => [...m, userMsg, botMsg]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    void onSendMessage(text);
  }

  return (
    <div className="flex flex-col">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Stel een vraag</h3>
      <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">Typ je vraag — binnenkort beantwoordt onze assistent deze automatisch.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block rounded-lg px-3 py-1.5 text-sm ${m.from === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Typ je vraag…" />
        <Button type="submit">Stuur</Button>
      </form>
    </div>
  );
}
```

### B.6 Widget — `src/components/help/help-widget.tsx`

Zwevende knop rechtsonder + slide-over paneel. Spiegelt het bestaande `ChatDrawer`-patroon.

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHelp } from '@/providers/help-provider';
import { Input } from '@/components/ui';
import { HelpSuggestions } from './help-suggestions';
import { HelpChatPanel } from './help-chat-panel';

export function HelpWidget() {
  const { isOpen, open, close, moduleKey } = useHelp();
  const [search, setSearch] = useState('');

  return (
    <>
      {/* Zwevende knop */}
      {!isOpen && (
        <button
          onClick={open}
          aria-label="Help openen"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition hover:bg-primary-700"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      {/* Slide-over paneel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold text-gray-900">Help</span>
            <button onClick={close} aria-label="Sluiten" className="text-gray-400 hover:text-gray-600">✕</button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <form
              onSubmit={(e) => { e.preventDefault(); }}
              // Enter → naar het helpcentrum met de zoekterm
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek in de help…"
              />
            </form>

            <HelpSuggestions moduleKey={moduleKey} onNavigate={close} />

            <div className="border-t pt-4">
              <HelpChatPanel moduleKey={moduleKey} />
            </div>
          </div>

          <div className="border-t px-4 py-3">
            <Link
              to={`/help/tickets/new?module=${moduleKey}`}   /* route komt in Fase 4 */
              onClick={close}
              className="block w-full rounded-lg bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-800 hover:bg-gray-200"
            >
              Een vraag? Maak een ticket aan
            </Link>
            <Link to="/help" onClick={close} className="mt-2 block text-center text-xs text-gray-500 hover:underline">
              Naar het volledige helpcentrum
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
```

`src/components/help/index.ts`:

```ts
export { HelpWidget } from './help-widget';
export { HelpSuggestions } from './help-suggestions';
export { HelpChatPanel } from './help-chat-panel';
```

### B.7 Wiring

**`src/main.tsx`** — `HelpProvider` binnen `AuthProvider` (naast `ChatProvider`). Het moet onder `BrowserRouter` zitten omdat het `useLocation` gebruikt (dat is het al):

```tsx
import { HelpProvider } from '@/providers/help-provider';
// …
              <ChatProvider>
                <HelpProvider>
                  <QuickCreateProvider>
                    <WindowTabsProvider>
                      <App />
                    </WindowTabsProvider>
                  </QuickCreateProvider>
                </HelpProvider>
              </ChatProvider>
```

**`src/components/layout/app-layout.tsx`** — render de widget naast `<ChatDrawer />`:

```tsx
import { HelpWidget } from '@/components/help';
// …
      <ChatDrawer />
      <HelpWidget />
    </div>
```

---

## C. Verificatie & Definition of Done

```bash
cd apps/api
pnpm test                         # getContextual: moduleKey-match + fallback + org-priority sortering
pnpm test:e2e -- help             # contextual respecteert zichtbaarheid (globaal + eigen org, PUBLISHED only)

# root
npx turbo run build               # api + portal groen
```

**Smoketests (browser):**
1. Open de widget op `/quotes` → "Relevante artikelen" toont offerte-artikelen (max 5; bij >5 een "Meer (N)").
2. Open de widget op een view zónder eigen artikelen → fallback met meest-bekeken artikelen (paneel nooit leeg).
3. ORG_ADMIN met een eigen org-artikel met `moduleKeys: ['quotes']` → dat artikel staat bovenaan met de "eigen org"-badge.
4. Typ in het chatveld → bericht + canned antwoord verschijnen; footer-knop linkt naar `/help/tickets/new?module=quotes`.
5. Klik een suggestie → navigeert naar `/help/article/:slug`, widget sluit.

**Klaar wanneer:**

- [ ] `GET /help/articles/contextual` staat vóór `articles/:slug` en respecteert zichtbaarheid + `PUBLISHED`.
- [ ] Widget verschijnt op elke ingelogde route (knop rechtsonder), opent/sluit correct.
- [ ] Suggesties tonen max. 5 + "Meer (N)"; org-specifiek vóór globaal; nooit leeg (fallback werkt).
- [ ] `moduleKey` volgt de huidige route (langste-prefix-match), incl. `/work-orders` → `planning`.
- [ ] Chat-placeholder werkt met de `onSendMessage`-haak; geen echte bot-call.
- [ ] `npx turbo run build` groen.

**Commit:** `feat: implement IMP_PRD-10 — fase 3 help-widget, contextuele suggesties & chat-placeholder`

> Volgende stap (Fase 4): tickets — `support-tickets`-module, `/help/tickets` (mijn + org), formulier (de widget-footer wordt dan functioneel), detail/thread, SUPERUSER-wachtrij, notificaties. Zie `IMP_PRD_10_Helpsysteem.md` §6.2, §13.
