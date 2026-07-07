# Codebase-review & aanbevelingen — juli 2026

> Review van InspeXi-Beheer (monorepo) + Inspexi-App (PWA-repo, branch `feat/pwa-conflict-resolution`).
> Doelschaal: ~100 organisaties, ~500 gebruikers. Bevindingen zijn steekproefsgewijs geverifieerd tegen de code.
> Bedoeld als werklijst om per onderwerp verder uit te werken (met Opus).

---

## Samenvatting & topprioriteiten

De codebase is architectonisch volwassen (multi-tenancy, shared utils, testdekking kern, sync-engine). De grootste risico's zitten niet in de feature-code maar in **operationele gereedheid** en een handvol **schaal-blockers**. Geschatte productie-gereedheid: **~60%**.

| # | Prioriteit | Onderwerp | Waarom |
|---|---|---|---|
| P0 | 🔴 | Seed-script zonder productie-guard | Eén `pnpm db:seed` op prod = totale dataverlies (152× `deleteMany`, geen `NODE_ENV`-check) |
| P0 | 🔴 | Geen health-endpoint, geen error-tracking, geen CI | Onzichtbare crashes; deploy is handwerk zonder vangnet |
| P0 | 🔴 | In-memory tenant-cache & throttler | Blokkeert >1 API-instance; stale cache tot 5 min bij org-wijziging |
| P1 | 🟠 | Puppeteer-PDF in-process | Chromium-crash raakt de hele API; bulk-generatie verdringt ad-hoc requests |
| P1 | 🟠 | PWA: geen storage-quota-bewaking bij foto's | Stil dataverlies op iOS bij volle opslag |
| P1 | 🟠 | PWA v3-cutover (AssetNode-boom) | Backend is op v3; PWA nog niet — grootste openstaande integratiestap |
| P1 | 🟠 | Soft-delete inconsistentie (`isDeleted` vs `deletedAt`) | Query's vergeten filters; sync-tombstones vereisen `deletedAt` |
| P2 | 🟡 | Frontend-duplicatie portal ⇄ client-portal ⇄ PWA | api-client, format, status-maps, types 3× gekopieerd |
| P2 | 🟡 | Monoliet-services (chat 1449, generated-documents 896 regels) | Refactor vóór verdere featuregroei |

---

## A. Backend (apps/api)

### A1. Schaal & multi-instance (blockers)

1. **TenantCacheService is een proces-lokale `Map`** (`common/services/tenant-cache.service.ts`). Bij 2+ instances: instance A invalideert, B serveert 5 min stale org-data (incl. gedeactiveerde orgs). **Fix:** Redis-backed cache, of pragmatischer voor deze schaal: TTL naar 30–60s + `updatedAt`-check. Zelfde geldt voor de `@nestjs/throttler`-state (in-memory) → Redis-storage voor throttler bij >1 instance.
2. **Geen `/health` endpoint** — nergens in de codebase. Nodig voor load-balancer probes en zero-downtime deploys. **Fix:** `@nestjs/terminus` met DB- en storage-check, `@Public()`.
3. **Prisma connection-pool niet getuned.** Geen `connection_limit` in `DATABASE_URL`. Bij 2–4 instances × default pool kan Postgres' `max_connections` vollopen. **Fix:** expliciet `?connection_limit=15–25` per instance, of PgBouncer.
4. **RefreshToken-revocatie is DB-gebaseerd maar JWT-access-tokens blijven 15 min geldig na logout.** Acceptabel bij deze schaal — documenteren als bewuste keuze, geen actie nodig tenzij compliance anders eist.

### A2. Document-generatie (Puppeteer)

5. **PDF-generatie draait in-process in de API** (`document-generation/pdf-generation.service.ts`, semafoor max 3). Chromium-crash of memory-spike raakt álle API-verkeer; bulk-rapportgeneratie verdringt een urgente 1-pagina-offerte. **Fix (gefaseerd):** (a) korte termijn: timeout + browser-health-check + herstart-logica, concurrency configureerbaar via env; (b) middellange termijn: aparte worker (BullMQ + Redis, of een tweede "worker"-deployment van dezelfde image) met prioriteitswachtrij. Dit sluit aan op de al bestaande losse `convert-api` microservice-aanpak.

### A3. Security & tenant-isolatie

6. **Login-throttle 10/min per IP** (`auth.controller.ts:60`) = 600 pogingen/uur. **Fix:** 5/min + exponential backoff of account-lockout na N fouten; overweeg per-account-throttling naast per-IP.
7. **Magic-link client-portal:** verifieer dat tokens one-time zijn (of kort-levend na eerste gebruik) en niet in access-logs terechtkomen via querystring. K3-hardening (SEED_DEMO, 30d expiry) is al gedaan — check redemption-kant.
8. **Nullable `orgId` op enkele modellen** (o.a. AuditLog is bewust nullable voor SUPERUSER). Audit alle modellen met nullable `orgId` en documenteer per model waaróm; enforce NOT NULL waar mogelijk.
9. **Prisma-errors naar de client:** check `http-exception.filter.ts` dat P2002/P2025-details (constraint-/kolomnamen) niet lekken; generieke NL-melding naar client, detail in serverlog.
10. **`.env.example` bevat een KVK-key in echt formaat** (`KVK_API_KEY=l7xx1f26...`). Het is de publieke KvK-testkey, maar vervang door placeholder + comment om gewoonte-vorming te voorkomen. JWT-placeholder-validatie (`validate-jwt-secrets.ts`) is al goed geregeld ✓.

### A4. Performance

11. **Search doet `contains`/`ILIKE '%q%'`** over companyName/naam/email (`search.service.ts:146-191`) zonder trigram-index. GIN/`pg_trgm` bestaat al voor help-articles (schema regel 4408) — zelfde patroon toepassen op Contact-zoekvelden. Full-table-scans worden merkbaar vanaf ~50–100k contacten totaal.
12. **Offset-paginatie** in `paginate()`-util: prima voor nu; overweeg keyset-paginatie alleen voor de grootste lijsten (findings, audit-log) als die >100k rijen per org worden.
13. **Indexen:** audit hot paths — o.a. samengestelde indexen op `(orgId, contactId)` voor InspectionPlan-lijsten en `(assetNodeId, inspectionPlanId)` voor uitvoeringsrecords. Extraheer de werkelijke `where`-combinaties uit de services en leg per ontbrekende index een migratie aan.
14. **Audit-writes zijn fire-and-forget** ✓ (goed), maar bij sync-bursts (PWA-push met honderden records) kan het aantal `$executeRaw`-inserts pieken. Overweeg batching van audit-writes binnen één sync-request.
15. **Sync-push:** body-limit is 10MB (`main.ts:66`) ✓, maar er is geen chunking-contract. Definieer max entiteiten per push-batch (bijv. 500) in het v3-contract, zodat de PWA grote backlogs opknipt (belangrijk op mobiel netwerk).

### A5. Refactoring

16. **`chat.service.ts` — 1449 regels.** Grootste bestand van de API. Opsplitsen conform het bestaande patroon (quotes/planning): ThreadsService, PresenceService, TranscriptService; controller delegeert.
17. **`generated-documents.service.ts` — 896 regels** + diep-geneste `PLAN_INCLUDE`. Splits generatie-context-opbouw (query-laag) van orchestratie (PDF/Word/ondertekenen); selectieve includes per documenttype.
18. **Overige >600-regel services:** planning (861), users (741), checklists (701), documents (678), sync (676), search (663), projects (654), quotes (643). Niet allemaal urgent; hanteer een vuistregel (~500 regels → splitsen bij volgende feature-touch).
19. **Compat-wrappers `assets` (302) en `inspection-locations` (234)** staan gepland voor verwijdering ná PWA-cutover — koppel dit expliciet aan de v3-cutover-milestone zodat het niet blijft hangen.
20. **Soft-delete standaardiseren:** kern-CRM gebruikt `isDeleted`, inspectiedomein `deletedAt` (nodig voor sync-tombstones). Kies `deletedAt` als doelstandaard; migreer kern-modellen gefaseerd of documenteer de tweedeling expliciet + lint/review-checklist. Voeg een opruimjob toe voor tombstones (>90d).
21. **JSON-kolommen zonder schema-validatie** (`metadata`, `technicalData`, `checklistResults`): valideer met Zod in de service-laag vóór opslag.

### A6. Gecorrigeerde claims (geen actie)

- Nummering-engine is **wél atomair** (raw `INSERT ... ON CONFLICT DO UPDATE value = value + interval`, `numbering.service.ts:265-268`) — geen race-conditie.
- E2E draait **wél** op `maxWorkers: 1` (`test/jest-e2e.json:14`).
- Er staan **geen echte secrets** in git (alleen `.env.example`-bestanden getrackt).
- R2-storage-provider **bestaat al** (`storage/r2-storage.provider.ts`) — alleen prod-config + verplichtstelling nodig.

---

## B. Frontend (portal + client-portal)

22. **Duplicatie portal ⇄ client-portal:** `api-client.ts` (175 vs 144 regels, ~85% overlap maar divergente 401-afhandeling), `format.ts`, `status.ts`, download-util, types. **Fix:** `packages/shared` workspace-package (api-client-core, format, status-maps, gedeelde types). De monorepo heeft al een `packages/`-map — gebruik die.
23. **Query-key-hygiëne:** keys met param-objecten (`['contacts', params]`) zonder centrale factory. Invalidatie op `['contacts']` matcht prefix-gewijs wél gefilterde varianten, maar object-property-volgorde en ad-hoc keys geven subtiele stale-data-bugs. **Fix:** query-key-factory per domein (klein package of `lib/query-keys.ts`), alle hooks migreren.
24. **Mutatie-foutafhandeling:** niet elke mutation toont een toast bij een fout. **Fix:** standaard `onError` → `useToast` in de gedeelde `use-api-mutation`-hook, met `getErrorMessage()`-fallback in het Nederlands.
25. **Bundle:** pagina's zijn lazy ✓, maar zware libs (docx-preview, xlsx, konva) verdienen `manualChunks` in `vite.config.ts` + lazy component-imports waar nog top-level. Voeg `rollup-plugin-visualizer` toe aan de build voor bewaking.
26. **Types-monoliet:** `types/index.ts` per app; geen gedeelde bron met API-DTO's. Minimaal: opsplitsen per domein met re-export. Idealiter: gedeelde types in `packages/shared` (handmatig gecureerd; volledige DTO-generatie is overkill voor deze schaal).
27. **Sidebar-navigatie bij ~60 modules:** collapsible secties + evt. zoekveld; controleer of dit al afdoende is met de submenu-structuur.
28. **Kleinere punten:** ErrorBox consequent gebruiken i.p.v. lokale `bg-danger-50`-divs; aria-labels op icon-buttons; tableConfig-localStorage versioneren (kolom verwijderd → stale config resetten); error-boundary rond docx-preview (corrupt bestand mag geen paginacrash geven); optimistic updates uitbreiden voorbij het kanban-bord (status-wissels op detailpagina's).

---

## C. PWA (Inspexi-App)

29. **Repo-hygiëne: de oude monorepo bevat nog `apps/api`, `apps/portal` en `apps/client-portal`** naast `apps/inspectie-app`. Die zijn vervangen door InspeXi-Beheer. **Fix:** verwijder of archiveer de legacy-apps (aparte branch/tag), maak de repo een zuivere PWA-repo. Voorkomt verwarring en per ongeluk patchen van dode code.
30. **Monolieten:** `services/db/index.ts` — **4672 regels**; `syncService.ts` — **2156 regels**. Splits db-laag per domein (tables + migraties + helpers) en sync in pull/push/conflict-modules. Doe dit vóór of tijdens de v3-cutover, niet erna.
31. **Foto-opslag zonder quota-bewaking:** blobs in IndexedDB, geen `navigator.storage.estimate()`/`persist()`-gebruik gevonden. Op iOS (strikte quota's + eviction) betekent dit stil dataverlies. **Fix:** quota-check vóór foto-opslag, `navigator.storage.persist()` aanvragen, waarschuwing in UI bij >80% gebruik, en foto's met upload-prioriteit syncen zodat lokale opslag vrijkomt.
32. **v3-cutover (AssetNode-boom):** de backend-push is op contract v3; de PWA zit op v2 (`feat/pwa-v2-sync-contract` / huidige branch `feat/pwa-conflict-resolution`). Aanbevolen strategie:
    1. **Dual-mode client:** PWA leest server-capability (`/sync/meta` versie-endpoint) en spreekt v2 óf v3.
    2. **Dexie-migratie** naar assetNode-gebaseerd schema met een eenmalige lokale transformatie (locaties+assets → nodes), pas ná succesvolle volledige push van openstaande v2-wijzigingen ("clean cutover per device").
    3. **Pilot** met 1–2 inspecteurs, daarna hard-cutover; compat-wrappers in de API pas daarna verwijderen (zie A19, `docs/fase3/PWA-CUTOVER-ASSET-NODE.md`).
33. **Sync-robuustheid:** conflict-loop-bescherming is per record — voeg een globale cooldown/circuit-breaker toe zodat een ping-pongend record niet de hele sync-cyclus blijft triggeren. Check dubbel-push-paden (REST-call + sync-queue voor dezelfde mutatie online) → één schrijfpad kiezen.
34. **Token-expiry offline:** definieer de flow expliciet — refresh bij reconnect, en bij verlopen refresh-token een duidelijke re-login-prompt mét behoud van de lokale queue (nooit lokale data wissen bij logout-forced).
35. **Service-worker update-flow:** toon een "nieuwe versie beschikbaar"-prompt (skipWaiting + reload op bevestiging), zodat inspecteurs niet weken op oude versies blijven — cruciaal rond de v3-cutover.
36. **Dexie-open-failure:** vang `db.open()`-fouten (corrupte DB, private mode, quota) af met een herstel-scherm i.p.v. een witte pagina.

---

## D. Deployment & operations (100 orgs / 500 users)

### Huidige staat
Alleen `convert-api` heeft een Dockerfile; geen CI/CD-workflows; geen reverse-proxy-config; geen backups; geen monitoring; docker-compose is dev-only (Postgres). R2-provider en JWT-secret-validatie bestaan al ✓.

### Aanbevolen doelarchitectuur (pragmatisch, geen Kubernetes nodig)
Bij 500 gebruikers is de piekbelasting bescheiden (~tientallen gelijktijdige requests). Advies: **managed containers of 2 VM's, geen K8s** — de operationele kosten van Kubernetes zijn hier niet gerechtvaardigd.

```
Cloudflare (DNS, wildcard-cert *.inspexi.nl, CDN, DDoS)
   │
Caddy of Traefik (reverse proxy, auto-TLS, X-Forwarded-*)
   │
├── api        (Node, 2 instances, health-checked)   ─┐
├── worker     (zelfde image, BullMQ: PDF/Puppeteer)  ├─ Docker Compose op 1–2 Hetzner/DO VM's
├── convert-api (LibreOffice, 1 instance, mem-limit)  │   óf managed containers (Fly.io/Railway)
├── portal + client-portal + PWA (statisch via CDN/nginx)
   │
Managed PostgreSQL (backups, PITR)  ·  Redis (cache/queue/throttle)  ·  Cloudflare R2 (uploads)
Sentry (errors)  ·  Uptime-monitoring  ·  Grafana Cloud of Better Stack (logs/metrics)
```

Indicatieve kosten: **€250–450/maand.** Schaalpad: extra api-instance en aparte worker-VM erbij; geen re-architectuur nodig tot ver voorbij 100 orgs.

### Actielijst deployment
37. **Seed-guard (P0):** `seed.ts` weigert bij `NODE_ENV=production` tenzij `FORCE_SEED=1`. Eén regel, voorkomt een ramp.
38. **Dockerfiles** voor api (multi-stage, incl. Chromium voor Puppeteer), portal/client-portal (nginx of puur CDN-upload) — of hergebruik/port de Dockerfiles die al in de Inspexi-App-repo staan.
39. **CI/CD (GitHub Actions):** lint + `turbo run build` + unit + E2E (met services-Postgres) op elke PR; image-build + `prisma migrate deploy` + deploy op main-merge. Migratie draait vóór app-start in de entrypoint, mét automatische pre-migrate `pg_dump`.
40. **Health + graceful shutdown:** `/api/v1/health` (terminus), `app.enableShutdownHooks()`, SIGTERM-drain 30s → zero-downtime rolling restart achter de proxy.
41. **Sentry** in api, portal, client-portal én PWA (offline-buffering van events). Request-ID bestaat al — propageer hem naar convert-api en log als JSON (pino).
42. **Storage:** `STORAGE_DRIVER=r2` verplicht in prod (weiger lokale storage bij `NODE_ENV=production`); lifecycle-rules op de bucket.
43. **Backups:** managed-Postgres-backups + dagelijkse `pg_dump` naar R2 (2e locatie); maandelijkse restore-test in staging.
44. **E-mail:** SPF/DKIM/DMARC voor het Resend-domein; bounce-webhook (`RESEND_WEBHOOK_SECRET` bestaat al in env).
45. **Load-test vóór go-live:** k6-script met realistische mix (sync-push van 5 inspecteurs, 20 portal-gebruikers, 2 PDF-generaties tegelijk).

---

## E. Functionaliteits-aanbevelingen (product)

46. **Rapportage/dashboard per org:** doorlooptijden inspecties, openstaande constateringen per klant, offerte-conversie. De data is er; een dashboard-module maakt het platform "chef-proof" voor de inspectiebedrijven zelf.
47. **Herinspectie-flow:** plan-uit-plan kopiëren met de AssetNode-boom als anker (assets zijn nu plan-ontkoppeld — dé feature die de unified boom verzilvert): nieuwe inspectie op zelfde locatie toont vorige findings per asset + status "opgelost/terugkerend".
48. **Constatering-opvolging:** deadline + escalatie-notificaties op openstaande findings richting klant (client-portal doet al "oplossen + foto" — voeg SLA/rappel toe).
49. **Per-org API-quota & feature-flags:** bij 100 orgs wil je een afwijkende org kunnen begrenzen (sync-frequentie, PDF-volume) — sluit aan op bestaande entitlements.
50. **Org-onboarding-wizard (SUPERUSER):** nieuwe org + admin-invite + standaard inspectie-config (templates/checklists klonen van een blauwdruk-org) in één flow — bij 100 orgs is handmatige setup de bottleneck.
51. **Audit-log-retentie & export:** retentiebeleid per org + CSV-export; belangrijk voor compliance-verkoopargument.

---

## F. Voorgestelde volgorde (uitwerken met Opus)

| Sprint | Focus |
|---|---|
| 1 | P0's: seed-guard, health-endpoint, Sentry, CI-pipeline, Dockerfiles |
| 2 | Redis (tenant-cache, throttler, BullMQ), PDF naar worker, R2 verplicht in prod |
| 3 | Staging-omgeving + deploy-runbook + backups + load-test |
| 4–5 | PWA: quota-bewaking, SW-update-flow, db/sync-refactor → v3-cutover (dual-mode → pilot → hard cutover) |
| 6 | Compat-wrappers verwijderen, soft-delete-standaardisatie, chat/generated-documents refactor |
| 7 | `packages/shared` (api-client, status, format, types), query-key-factory, mutatie-toasts |
| doorlopend | Indexen op hot paths, trigram-search, functionaliteit E46–E51 op roadmap |
