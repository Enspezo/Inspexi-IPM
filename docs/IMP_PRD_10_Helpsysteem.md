# IMP_PRD_10 — Helpsysteem (Knowledge base, tickets, support-toegang & chat)

> Status: **Concept / plan** — juni 2026
> Auteur: plan opgesteld met Claude (Cowork)
> Verwante docs: `INTEGRATIE-INSPEXI-APP.md`, `IMP_PRD_09_SaaS-Abonnementen.md`, `atera-ui-briefing.md`
> Implementatie per fase: `IMP_PRD_10_Fase1..5-implementatie.md`
> Conventies: code/identifiers in het **Engels**, UI-teksten/seed/PRD in het **Nederlands** (zie `CLAUDE.md`).

### Vastgestelde keuzes (juni 2026)

* **KB-scope = hybride:** globale artikelen (door InspeXi/SUPERUSER, zichtbaar voor alle tenants) **én** optioneel org-specifieke artikelen (door ORG_ADMIN, alleen zichtbaar binnen de eigen org). Geïmplementeerd via een nullable `orgId` (`null` = globaal).
* **Support-toggle = consent + audit:** SUPERUSER houdt technisch altijd toegang; de toggle legt expliciete toestemming + audittrail (+ optionele JIT-expiry) vast en logt ook daadwerkelijke inzage.
* **Tickets blijven gescheiden van `error-reports`:** een ticket met categorie `BUG` mag later naar een error-report linken, maar beide houden hun eigen lifecycle.

---

## 1. Doel & samenvatting

We bouwen een ingebouwde **Helpfunctie** in de portal (`apps/portal`), geïnspireerd op het ingelogde help-paneel van mijnWeFact en het ticket/KB-model van Atera, aangevuld met SaaS best-practices. De functie bestaat uit vier samenhangende onderdelen:

1. **Knowledge base (KB)** op `/help` — artikelen verdeeld in categorieën, doorzoekbaar, beheerd door InspeXi (SUPERUSER).
2. **Een zwevend help-paneel (widget)** dat overal in de portal te openen is en dat **contextueel** relevante KB-artikelen toont voor de view waarin de gebruiker zich bevindt (fuzzy match, max. 5 + "meer").
3. **Een chatvenster** in het paneel — nu een **placeholder met architectuur-haken**, later te koppelen aan een chatbot (RAG over de KB).
4. **Tickets** op `/help/tickets` — een ticketformulier + overzicht van alle tickets van de gebruiker én van diens organisatie met status.

Daarnaast een **support-toegang-toggle**: een SUPERUSER (InspeXi-support) heeft technisch altijd cross-tenant toegang, maar via deze toggle legt de organisatie **expliciete, geauditeerde toestemming** vast. Elke wijziging wordt opgeslagen in een **support-log**.

### Waarom dit ontwerp

* In-app/contextuele help leidt aantoonbaar **2–3× meer tickets af** dan losse externe documentatie, omdat hulp verschijnt op het moment dat de gebruiker vastloopt ([Helpjuice](https://helpjuice.com/blog/in-app-user-guidance), [HappySupport](https://happysupport.ai/blog/contextual-help-widget-saas)).
* Een contextuele widget vereist drie technische bouwstenen: (a) het paneel leest de huidige route, (b) artikelen zijn getagd per productgebied, (c) er is een match-/ranking-laag. Dit ontwerp voorziet alle drie ([HappySupport](https://happysupport.ai/blog/contextual-help-widget-saas)).
* Support-toegang volgt het **just-in-time / expiring access**-principe met volledige audittrail (wie verleende toegang + wie had toegang), conform PAM/JIT best-practices en Salesforce' "Grant Login Access" ([Salesforce](https://help.salesforce.com/s/articleView?id=000384334), [ScreenConnect PAM](https://www.screenconnect.com/blog/privileged-access-management-best-practices)).
* Het ticketmodel volgt de gangbare helpdesk-velden en statuslevenscyclus (Open → In behandeling → Wacht op klant → Opgelost → Gesloten) met prioriteit ([Freshdesk](https://support.freshdesk.com/support/solutions/articles/50000010094-understand-and-customize-ticket-fields), [InvGate](https://blog.invgate.com/help-desk-priority-levels)).

---

## 2. Scope

**In scope (dit PRD):**

* KB-datamodel + beheer (SUPERUSER) + lees-UI voor alle gebruikers.
* Zwevend help-paneel met contextuele suggesties + zoekveld + chat-placeholder + link naar ticketformulier.
* Tickets (aanmaken, threaded reactie, status), gebruikers- en organisatie-overzicht, SUPERUSER-wachtrij.
* Support-toegang-toggle + support-log + JIT-expiry + logging van daadwerkelijke support-toegang.

**Out of scope (later, zie §13 Fase 6):**

* De daadwerkelijke chatbot/RAG-implementatie (alleen haken).
* SLA-timers, CSAT-enquêtes, geavanceerde analytics-dashboards.
* Publieke (uitgelogde) help-site / SEO-helpcenter.
* E-mail-naar-ticket (inbound mailbox parsing).

---

## 3. Bestaande infrastructuur die we hergebruiken

Het platform heeft al veel bouwstenen die we **niet opnieuw maken**:

| Behoefte | Bestaand mechanisme | Pad |
|---|---|---|
| Multi-tenant isolatie | `TenantMiddleware`, `TenantGuard`, `orgScope(user)`, `assertSameOrg` | `apps/api/src/common` |
| Lijst-endpoints | `paginate()`, `buildOrderBy()`, `assertFound()` | `apps/api/src/common/utils` |
| Per-org oplopende nummers | patroon `@@unique([orgId, <veld>])` + numbering-module | `quotes`, `numbering` |
| Audit trail | Prisma `$use` middleware + `AUDITED_MODELS` | `apps/api/src/prisma/prisma.service.ts` |
| Bijlagen | `documents`-module + `DocumentEntityType` (uitbreidbaar) | `apps/api/src/modules/documents` |
| Notificaties | `notifications`-module + `NotificationType` enum | `apps/api/src/modules/notifications` |
| Per-org feature-toggle (precedent) | `Organization.chatEnabled: Boolean` | `schema.prisma` |
| Chat-infrastructuur | `chat`-module + `ChatThread/ChatParticipant/ChatMessage` (UI nog niet gebouwd) | `apps/api/src/modules/chat` |
| AI-sleutel | `ANTHROPIC_API_KEY` (al gebruikt door `voice`) | `apps/api/.env` |
| Overzicht-/detailpagina's | `DetailPageLayout`, `TableConfigSidebar`, `useTableConfig`, `PageHeader`, `StatusBadge`, `Tabs`, `useConfirm`, `AuditHistory` | `apps/portal/src/components` |
| Statuskleuren | `lib/status.ts` (`StatusMap`, `StatusBadge`) | `apps/portal/src/lib` |
| Tenant-scoped UI-state | `tenantStorage` | `apps/portal/src/lib/storage.ts` |

**Belangrijke ontwerpkeuze t.o.v. bestaande modules:**

* **`error-reports`** (bestaat al: automatische bug/crash-rapporten, status `OPEN/IN_BEHANDELING/OPGELOST`) blijft **gescheiden** van support-**tickets** (door gebruiker ingediende vragen). Een ticket met categorie `BUG` mag later naar een error-report verwijzen, maar ze hebben verschillende lifecycles. Consolidatie is een open vraag (§14).
* **`chat`** (interne team-chat per org, met `referenceEntityType`) is iets anders dan de **help-chat** (gebruiker ↔ support/bot). We bouwen een **lichte, aparte help-chat-laag**, maar hergebruiken waar mogelijk dezelfde berichtenpatronen. In fase 1 is dit slechts een placeholder-component met een `onSendMessage`-haak.

---

## 4. Informatie-architectuur & routing

```
/help                         → Help-center: categorieën, zoeken, populaire artikelen
/help/article/:slug           → Artikel-detailpagina (markdown, "was dit nuttig?")
/help/tickets                 → Ticket-overzicht (mijn tickets + org-tickets) met status
/help/tickets/new             → Ticketformulier (ook als modal vanuit de widget)
/help/tickets/:id             → Ticket-detail + reactie-thread

(SUPERUSER, op mijn.localhost)
/help/admin                   → KB-beheer: categorieën + artikelen (block/markdown-editor)
/help/admin/tickets           → Support-wachtrij: alle tickets over alle organisaties
```

**Het zwevende help-paneel (widget)** is geen route maar een globale overlay (rechtsonder), beschikbaar op élke ingelogde pagina via `HelpProvider` in `AppLayout`. Inhoud van het paneel, van boven naar beneden:

1. Titel + zoekveld (enter → `/help` met query).
2. **Contextuele suggesties** voor de huidige module (max. 5 links; bij meer een "Meer"-knop die de lijst uitklapt).
3. **Chat** (placeholder met haken).
4. Footer: **"Een vraag? Maak een ticket aan"** → `/help/tickets/new` (voorgevuld met de huidige context).

De support-toggle leeft in **Organisatie → Instellingen** (org-admin), niet in het paneel zelf, omdat het een organisatie-instelling met juridische lading is.

---

## 5. Datamodel (Prisma)

Alle tabellen krijgen prefix `imp_`. **KB is hybride:** rijen met `orgId = null` zijn **globaal** (door InspeXi/SUPERUSER, zichtbaar voor alle tenants); rijen met een `orgId` zijn **org-specifiek** (door ORG_ADMIN, alleen zichtbaar binnen die org). **Tickets, support-logs en de toggle zijn altijd org-scoped.**

> **Zichtbaarheidsregel KB (overal toepassen):** lijst-/zoek-/contextuele queries filteren met `WHERE org_id IS NULL OR org_id = :userOrgId`. Schrijven: globale rijen (`orgId = null`) alleen door SUPERUSER; org-rijen alleen door ORG_ADMIN van diezelfde org.

### 5.1 Nieuwe enums

```prisma
enum HelpArticleStatus { DRAFT PUBLISHED ARCHIVED }

enum SupportTicketStatus { NIEUW IN_BEHANDELING WACHT_OP_KLANT OPGELOST GESLOTEN }

enum SupportTicketPriority { LAAG NORMAAL HOOG URGENT }

enum SupportTicketCategory { VRAAG PROBLEEM BUG FEATURE_REQUEST FACTUUR OVERIG }

enum SupportMessageAuthorType { USER SUPPORT SYSTEM }

enum SupportAccessAction { ENABLED DISABLED EXPIRED ACCESSED }
```

> De volledige modellen + back-relations + migraties staan paste-ready in `IMP_PRD_10_Fase1-implementatie.md`. Hieronder de kern.

### 5.2 Knowledge base (hybride)

`HelpCategory` en `HelpArticle` krijgen beide een nullable `orgId` (`null` = globaal). `slug` is uniek per scope via `@@unique([orgId, slug])`. `HelpArticle` heeft `moduleKeys String[]` (voor contextuele matching), `tags`, `status`, `viewCount`, `helpfulYes/No`, `excerpt`, `body @db.Text`, `authorId`, `publishedAt`.

> **Scope-regels:** een org-specifiek artikel mag aan een globale of eigen org-categorie hangen; een org schrijft nooit in een ándere org (valideer op `categoryId`).
> **Fuzzy zoeken:** Postgres `pg_trgm` + GIN-trigram-index op `title`/`excerpt` (raw SQL-migratie); `moduleKeys` krijgt een GIN-index voor array-overlap (`&&`/`hasSome`).

### 5.3 Tickets (org-scoped)

`SupportTicket` (per-org `ticketNumber` via `@@unique([orgId, ticketNumber])`; `subject`, `description`, `status`, `priority`, `category`, `contextModule/Url`, `createdById`, `assignedToId`, tijdstempels, `isDeleted`) + `SupportTicketMessage` (thread; `authorType`, `isInternal`).

> **Ticketnummer:** per-org oplopend (zelfde patroon als `quoteNumber`); bij voorkeur via de `numbering`-module met nieuwe `NumberingModel.SUPPORT_TICKET`.
> **Bijlagen:** hergebruik de `documents`-module — voeg `SUPPORT_TICKET` toe aan `DocumentEntityType`.

### 5.4 Support-toegang (org-scoped)

Velden op `Organization`: `supportAccessEnabled: Boolean` + `supportAccessExpiresAt: DateTime?`. Plus `SupportAccessLog` (`action`, `performedById/Role`, `ip`, `userAgent`, `note`, `createdAt`).

**Semantiek van de toggle:**

* **SUPERUSER houdt technisch altijd cross-tenant toegang.** De toggle verandert dit niet, maar legt **consent + audit** vast — vergelijkbaar met Salesforce "Grant Login Access".
* `ENABLED` → expliciete toestemming binnen de (optionele) `supportAccessExpiresAt`. `DISABLED` → support-inzage wordt gemarkeerd als "zonder actieve toestemming" (waarschuwing aan de superuser).
* Elke wijziging schrijft een `SupportAccessLog`-rij (`ENABLED`/`DISABLED`) met wie, rol, IP, tijd en optionele reden.
* **JIT-expiry:** scheduled job zet verlopen grants uit en logt `EXPIRED` (hergebruik `@nestjs/schedule`; precedent `quotes/quote-scheduler.service.ts`).
* **Toegang loggen:** een interceptor schrijft een `ACCESSED`-rij wanneer een SUPERUSER de org daadwerkelijk bekijkt onder een actieve grant (gethrottled, ~1×/dag).

### 5.5 Audit trail & seed-volgorde

* Voeg `HelpArticle`, `HelpCategory`, `SupportTicket` toe aan de audit-registry (`AUDITED_ENTITIES` in `audited-entities.ts`). `SupportAccessLog` is een **eigen, expliciete log**.
* **Seed cleanup-volgorde** (`prisma/seed.ts`) — kinderen eerst, vóór `organization`/`user`:

```ts
await prisma.supportTicketMessage.deleteMany();
await prisma.supportTicket.deleteMany();
await prisma.supportAccessLog.deleteMany();
// KB: helpArticle heeft FK's naar user (authorId) én organization (orgId, nullable),
// dus vóór user én organization verwijderen:
await prisma.helpArticle.deleteMany();
await prisma.helpCategory.deleteMany();
```

* **Seed-data:** ~6 KB-categorieën met elk 2–4 gepubliceerde artikelen (realistische `moduleKeys`/`tags`); 2–3 demo-tickets op de demo-org; een `supportAccessEnabled`-voorbeeld + log-rijen.

### 5.6 Migraties

```bash
cd apps/api
npx prisma migrate dev --name add-help-system          # modellen + enums + Organization-velden
npx prisma migrate dev --name help-trigram-search      # raw SQL: CREATE EXTENSION pg_trgm + GIN-indexen
```

> **NOOIT `prisma db push`** — altijd `migrate dev` (zie `CLAUDE.md`). Migraties draaien vanuit `apps/api/`.

---

## 6. API-architectuur

Twee nieuwe modules + een uitbreiding van `organizations`. Alle controllers volgen het bestaande patroon: `@ApiTags`, `@Roles(...)`, `@CurrentUser()`, `@CurrentTenant()`, responses als `{ success, data }`, services met `orgScope`/`paginate`/`assertFound`.

### 6.1 Module `help` (knowledge base)

`apps/api/src/modules/help/` → `help.controller.ts` (lezen), `help-admin.controller.ts` (CRUD), `help.service.ts`, `dto/`.

| Endpoint | Methode | Rol | Beschrijving |
|---|---|---|---|
| `GET /help/categories` | lezen | alle | Gepubliceerde categorieën (boomstructuur) |
| `GET /help/categories/:slug` | lezen | alle | Categorie + artikelen |
| `GET /help/articles` | lezen | alle | Filters: `categoryId`, `search`, `page`, `limit` |
| `GET /help/articles/contextual` | lezen | alle | `module`, `q`, `limit` → gerangschikte suggesties (§8) |
| `GET /help/articles/:slug` | lezen | alle | Artikel + `viewCount++` |
| `POST /help/articles/:id/feedback` | schrijven | alle | `{ helpful: boolean }` → `helpfulYes/No++` |
| `POST /help/categories` · `PATCH/:id` · `DELETE/:id` | beheer | SUPERUSER (globaal) · ORG_ADMIN (eigen org) | Categorie-CRUD |
| `POST /help/articles` · `PATCH/:id` · `DELETE/:id` | beheer | SUPERUSER (globaal) · ORG_ADMIN (eigen org) | Artikel-CRUD |
| `POST /help/articles/:id/publish` | beheer | SUPERUSER (globaal) · ORG_ADMIN (eigen org) | `DRAFT → PUBLISHED` (zet `publishedAt`) |

**Zichtbaarheid KB:** lees-endpoints filteren met `WHERE (org_id IS NULL OR org_id = :userOrgId)` én `status = PUBLISHED` — behalve voor de eigenaar-scope, die ook eigen concepten ziet (SUPERUSER: alle globale concepten; ORG_ADMIN: eigen org-concepten). **Schrijven:** een globale rij (`orgId = null`) alleen door SUPERUSER; een org-rij alleen door ORG_ADMIN van diezelfde org (service zet `orgId` server-side op `user.orgId` voor ORG_ADMIN). Een ORG_ADMIN mag globale rijen niet wijzigen/verwijderen.

### 6.2 Module `support-tickets`

`apps/api/src/modules/support-tickets/` → controller + service + dto.

| Endpoint | Methode | Rol | Beschrijving |
|---|---|---|---|
| `GET /support-tickets` | lezen | alle | `scope=mine\|org`, `status`, `page`, `limit` |
| `GET /support-tickets/stats` | lezen | alle | Aantallen per status |
| `POST /support-tickets` | schrijven | alle | Maakt ticket + eerste `SupportTicketMessage` |
| `GET /support-tickets/:id` | lezen | alle (org-scoped) | Ticket + thread (interne berichten verborgen voor niet-support) |
| `POST /support-tickets/:id/messages` | schrijven | alle (org-scoped) | Reactie; klant-reactie zet status terug naar `IN_BEHANDELING` |
| `PATCH /support-tickets/:id` | schrijven | org-admin / SUPERUSER | `status`, `priority`, `assignedToId` |

**Zichtbaarheid (multi-tenant):** `scope=mine` → `createdById = user.id`; `scope=org` → alle org-tickets, maar alleen voor `ORG_ADMIN`/`MANAGER` (overige rollen krijgen impliciet `mine`); **SUPERUSER** → wachtrij over alle orgs (via `orgScope(user)` = `{}`). Cross-tenant bescherming: `findOne`/`patch` valideren `ticket.orgId === user.orgId` (tenzij SUPERUSER); dekken in `cross-tenant.e2e-spec.ts`.

**Notificaties:** nieuwe `NotificationType`-waarden (`SUPPORT_TICKET_AANGEMAAKT/REACTIE/STATUS`). Dispatch fire-and-forget: nieuw ticket → SUPERUSER-support; support-reactie → eigenaar; statuswijziging → eigenaar.

### 6.3 Support-toegang (uitbreiding `organizations`)

Aparte `SupportAccessService` in de bestaande `organizations`-module.

| Endpoint | Methode | Rol | Beschrijving |
|---|---|---|---|
| `GET /organizations/:id/support-access` | lezen | ORG_ADMIN, SUPERUSER | `{ enabled, expiresAt }` |
| `PATCH /organizations/:id/support-access` | schrijven | ORG_ADMIN | `{ enabled, expiresInHours?, note? }` → toggelt + schrijft log |
| `GET /organizations/:id/support-access/logs` | lezen | ORG_ADMIN, SUPERUSER | Gepagineerde support-log |

* **Access-logging:** een lichte interceptor markeert (gethrottled) een `ACCESSED`-log wanneer een SUPERUSER een org bekijkt onder een actieve grant — leest de org-status uit de gecachete `TenantContext` (geen extra DB-read).
* **JIT-expiry:** cron (elke 5–15 min) zet verlopen grants uit en logt `EXPIRED`.

---

## 7. Frontend-architectuur

### 7.1 Globale help-context & widget

```
apps/portal/src/providers/help-provider.tsx     // context: isOpen, open(), close(), moduleKey
apps/portal/src/components/help/
  help-widget.tsx           // zwevende knop + slide-over paneel
  help-suggestions.tsx      // contextuele KB-links (max 5 + "Meer")
  help-chat-panel.tsx       // placeholder met onSendMessage-haak
  help-module-map.ts        // route-prefix → moduleKey
```

* `HelpProvider` komt in `main.tsx` binnen de provider-stack (binnen `AuthProvider`, naast `ChatProvider`). De `HelpWidget` wordt in `AppLayout` gerenderd naast `ChatDrawer`, zodat hij op elke protected route verschijnt.
* `moduleKey` wordt afgeleid uit `useLocation().pathname` via `help-module-map.ts`.

### 7.2 Pagina's & hooks

```
apps/portal/src/pages/help/
  help-center-page.tsx          // /help
  help-article-page.tsx         // /help/article/:slug
  tickets/tickets-page.tsx      // /help/tickets
  tickets/ticket-detail-page.tsx// /help/tickets/:id  (thread + Audit)
  tickets/new-ticket-page.tsx   // /help/tickets/new (ook vanuit de widget-footer)
  admin/help-admin-page.tsx     // /help/admin (SUPERUSER + ORG_ADMIN)
  hooks/  use-help.ts · use-support-tickets.ts · use-support-access.ts
```

* Lazy-imports + routes in `App.tsx` onder `<Route element={<AppLayout />}>`.
* Sidebar: "Help & support"-`NavItem` in `mainSections` (iedereen); KB-beheer als item met `roles: adminRoles`.
* Hooks volgen het TanStack-Query-patroon (`apiClient` + `queryKey` op params + `invalidateQueries`). `StatusBadge` op basis van nieuwe maps in `lib/status.ts`. Ticket-detail: `AuditHistory entityType="SupportTicket"`. Markdown sanitized renderen.

### 7.3 Ticketformulier (velden)

**Onderwerp** (verplicht), **Omschrijving** (verplicht), **Categorie**, **Prioriteit** (default `NORMAAL`), **Bijlage(n)** (via documents-module). Verborgen/voorgevuld: `contextModule` + `contextUrl` (auto vanuit de view waar de widget werd geopend) — versnelt diagnose.

---

## 8. Contextuele KB-suggesties (kernfeature)

**Doel:** bij het openen van het paneel dynamisch (fuzzy) de meest relevante artikelen tonen voor de huidige view; max. 5, met "Meer" om uit te klappen.

**Route → moduleKey (`help-module-map.ts`):** langste matchende prefix wint; geen match → `'general'`. Bv. `/quotes`→`quotes`, `/work-orders`→`planning`, `/inspections`→`inspections`.

**Endpoint `GET /help/articles/contextual?module=quotes&limit=5`** rangschikt gepubliceerde artikelen binnen de zichtbaarheidsscope (`org_id IS NULL OR org_id = :userOrgId`). Org-specifieke artikelen krijgen lichte voorrang boven globale bij gelijke relevantie. Score:

1. **moduleKey-match** (zwaarst): `moduleKeys && ['quotes']` (array-overlap / `hasSome`).
2. **tag-match** op de moduleKey en synoniemen.
3. **fuzzy titel/excerpt** via `pg_trgm similarity()` op een optionele `q`.
4. tie-break op `viewCount`/`order`.

Response bevat de top-N **plus `total`** zodat de frontend "Meer" weet te tonen. **Fallback** (best-practice): bij geen treffers de meest-bekeken artikelen tonen — het paneel is nooit leeg.

---

## 9. Chat-placeholder + architectuur-haken (voor latere bot)

In fase 3 is `help-chat-panel.tsx` een **placeholder** maar bruikbaar: toont de contextuele suggesties + een invoerveld. `onSendMessage(text)` is de centrale haak. Backend-stub `HelpChatService` met interface `ask(orgId, userId, message, context) → { reply, citedArticles }`, later te vervangen door **RAG**: embeddings over `HelpArticle.body`, retrieval + Anthropic-completion met de bestaande `ANTHROPIC_API_KEY`. Datamodel-haken (eigen `HelpChatSession`/`Message` of hergebruik van `chat`-modellen) leggen we nu **niet** vast.

---

## 10. Rollen & rechten (matrix)

| Actie | INSPECTEUR / BACKOFFICE / WERKVOORBEREIDER | MANAGER | ORG_ADMIN | SUPERUSER |
|---|---|---|---|---|
| KB lezen (globaal + eigen org) | ✅ | ✅ | ✅ | ✅ (incl. concepten) |
| KB schrijven — globaal | — | — | — | ✅ |
| KB schrijven — eigen org | — | — | ✅ | ✅ |
| Ticket aanmaken | ✅ | ✅ | ✅ | ✅ |
| Eigen tickets zien | ✅ | ✅ | ✅ | ✅ |
| Alle org-tickets zien | — | ✅ | ✅ | ✅ |
| Ticket status/prioriteit/assignee | — | (eigen org: optioneel) | ✅ (eigen org) | ✅ (alle orgs) |
| Support-wachtrij (alle orgs) | — | — | — | ✅ |
| Support-toegang toggelen | — | — | ✅ | (leest log) |
| Support-log bekijken | — | — | ✅ | ✅ |

---

## 11. Best-practices checklist (verwerkt in het ontwerp)

* **Taakgerichte titels**, antwoord in de eerste zin, korte stappen + screenshots ([KnowledgeOwl](https://www.knowledgeowl.com/blog/posts/saas-knowledge-base-best-practices)).
* **3–5 hoogste-frictie-gebieden eerst** vullen; uitbreiden op basis van analytics ([HappySupport](https://happysupport.ai/blog/contextual-help-widget-saas)).
* **No-result-zoekopdrachten loggen** om contentgaten te vinden ([Helpjuice](https://helpjuice.com/blog/in-app-user-guidance)).
* **Korte ticketformulieren**, context automatisch meesturen ([Freshdesk](https://support.freshdesk.com/support/solutions/articles/50000010093-basic-guide-for-ticket-forms-and-fields), [EasyDesk](https://easydesk.app/blog/help-desk-ticket)).
* **JIT/expiring support-toegang met volledige audittrail** ([Salesforce](https://help.salesforce.com/s/articleView?id=000384334), [ScreenConnect](https://www.screenconnect.com/blog/privileged-access-management-best-practices)).
* **Atera-referentie:** ticketlijst met status/prioriteit/toegewezen technicus, bulk-acties, opgeslagen weergaven en een AI-assistent-kolom — bevestigt onze kolomkeuze en de plek waar de latere bot landt.

---

## 12. Teststrategie

* **Unit (Jest, API):** `help.service` (contextuele ranking, publish-flow), `support-tickets.service` (nummering, statusovergangen, zichtbaarheid), `support-access.service` (toggle schrijft log, expiry).
* **E2E (API):** `support-tickets.e2e-spec.ts`, uitbreiding `cross-tenant.e2e-spec.ts` (org A mag tickets/logs/org-artikelen van org B niet zien/patchen → 403/404), `help.e2e-spec.ts`. Let op `e2e-`-prefix, slug zonder hyphens, cleanup-volgorde in `afterAll`.
* **Frontend (Vitest):** `help-module-map` (langste-prefix-match), suggesties-component (max 5 + "Meer"), ticketformulier-validatie (zod).
* **Browser-smoketest:** widget op `/quotes` toont offerte-artikelen; ticket aanmaken vanuit widget; support-toggle aan/uit schrijft zichtbaar een log-regel.
* **Verificatie-stap:** `npx turbo run build` + `pnpm test` + `pnpm test:e2e` vóór merge.

---

## 13. Gefaseerde implementatie

Elke fase is zelfstandig te mergen (`feat: implement IMP_PRD-10 — <fase>`). Per fase een apart implementatiedoc met paste-ready code: `IMP_PRD_10_Fase1..5-implementatie.md`.

**Fase 1 — Datamodel & seed.** Prisma-modellen, enums, `Organization`-velden, twee migraties (incl. `pg_trgm`), audit-registratie, seed.

**Fase 2 — KB backend + lees-UI + beheer.** `help`-module (lezen met zichtbaarheidsfilter + CRUD: SUPERUSER globaal, ORG_ADMIN eigen org), `/help`, artikelpagina, zoeken, `/help/admin`.

**Fase 3 — Help-widget + contextuele suggesties + chat-placeholder.** `HelpProvider`, `HelpWidget`, `help-module-map`, `GET /help/articles/contextual`, max 5 + "Meer", chat-placeholder met `onSendMessage`-haak.

**Fase 4 — Tickets.** `support-tickets`-module, `/help/tickets` (mijn + org), formulier, detail/thread, SUPERUSER-wachtrij, notificaties, bijlagen.

**Fase 5 — Support-toegang.** Toggle + endpoints + log + JIT-expiry + access-logging-interceptor + UI in Organisatie-instellingen.

**Fase 6 — Later (apart).** RAG-chatbot op de KB, SLA-timers, CSAT/"was dit nuttig"-analytics, no-result-zoekrapport, e-mail-naar-ticket, evt. consolidatie met `error-reports`.

---

## 14. Beslissingen & resterende keuzes

**Vastgesteld (juni 2026):**

1. ✅ **KB-scope = hybride** (globaal door SUPERUSER + optioneel org-specifiek door ORG_ADMIN), via nullable `orgId`. Verwerkt in §5.2, §6.1, §8, §10.
2. ✅ **Support-toggle = consent + audit** (SUPERUSER houdt toegang; toggle legt toestemming + audittrail + optionele JIT-expiry vast, en logt daadwerkelijke inzage). Verwerkt in §5.4, §6.3.
3. ✅ **Tickets gescheiden van `error-reports`** (BUG-ticket mag later linken). Verwerkt in §3, §5.3.

**Nog te bevestigen (voorgestelde default in vet — niet-blokkerend voor Fase 1):**

4. **Help-chat-opslag:** **default = nog niet vastleggen**; alleen de service-interface + UI-haak staan vast (§9).
5. **Ticketnummering:** **default = via de `numbering`-module** met nieuwe `NumberingModel.SUPPORT_TICKET` (configureerbaar prefix). Simpele per-org teller is het alternatief.
6. **MANAGER-rechten op tickets:** **default = inzien van alle org-tickets, bewerken alleen door ORG_ADMIN**. Optioneel later uitbreiden naar MANAGER.

> De vastgestelde keuzes zijn verwerkt. Fase 1 (schema + migratie + seed) kan als implementatie-PR opgepakt worden; de resterende keuzes (4–6) raken Fase 1 niet.
