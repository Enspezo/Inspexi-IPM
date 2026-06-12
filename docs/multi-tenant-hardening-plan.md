# Multi-Tenant Hardening — Plan

Resultaat van een security-audit (juni 2026) op de multi-tenant isolatie van InspeXi Beheer.
De architectuur is fundamenteel geschikt voor multi-tenant: drielaagse isolatie via
`TenantMiddleware` → `TenantGuard` (`user.orgId === tenant.orgId`) → org-scoping in services
(`orgScope()` / `findOne`-delegatie). Onderstaande 14 punten dichten de resterende gaten.

Status-legenda: ☐ open · ☑ gedaan

---

## Prioriteit 1 — Cross-tenant writes mogelijk (FK-validatie)

Patroon: create/update endpoints accepteren een vreemde-sleutel-UUID zonder te controleren
of de gerefereerde entiteit bij dezelfde organisatie hoort. Een gebruiker van org A die een
UUID van org B kent, kan koppelingen leggen of data lekken.

Aanpak: gedeelde helper `assertSameOrg()` / `assertAllSameOrg()` in `apps/api/src/common/utils/`,
overal aangeroepen in create/update vóór de schrijfactie.

- ☑ **1. Planning `create` valideert FK's niet** — `planning.service.ts:217`
  `contactId`, `locationId`, `quoteId`, `productId`, `contactPersonId` ongevalideerd op org.
- ☑ **2. Taken `create`/`update`** — `tasks.service.ts:205` / `:246`
  `entityId` (per `entityType`) en `assigneeId` ongevalideerd; `enrichWithEntityNames` lekt
  vervolgens namen van entiteiten uit andere orgs.
- ☑ **3. Contacts `setContactGroups`** — `contacts.service.ts:336`
  Klantgroep-ID's worden gekoppeld zonder org-check.
- ☑ **4. Planning `assignInspectors`** — `planning.service.ts:376`
  Inspecteur-user-ID's worden niet gecontroleerd op org-lidmaatschap.

## Prioriteit 2 — Infrastructuur / productie

- ☑ **5. Unknown-host bypass** — `tenant.guard.ts:45`
  Requests via IP of onbekend domein krijgen géén tenant-check (bewust voor E2E op
  `127.0.0.1`). In productie is dit een gat. Fix: fail-secure wanneer `BASE_DOMAIN !== 'localhost'`.
- ☑ **6. Refresh-token niet tenant-gebonden** — `auth.controller.ts:78` / `auth.service.ts:91`
  Cookie wordt in productie gedeeld over `.inspexi.nl`; `/auth/refresh` controleert niet of
  `user.orgId` bij het subdomein past. Fix: dezelfde tenant-check als bij `login()`.
- ☑ **7. Geen rate limiting** — `main.ts` / `app.module.ts`
  Eén tenant (of een token-enumerator op publieke endpoints) kan de API verzadigen.
  Fix: `@nestjs/throttler` globaal + strengere limieten op auth- en `@Public()`-routes.

## Prioriteit 3 — Schema & hygiëne

- ☑ **8. Org-cache (5 min) zonder invalidatie + geen `isActive`/`isDeleted` op Organization**
  `tenant.middleware.ts:16`. Een gedeactiveerde/gewijzigde org blijft tot 5 min geserveerd;
  orgs kunnen nu nooit ge-offboard worden. Fix: `isActive` veld + cache-invalidatie bij
  org-update/-delete; middleware filtert inactieve orgs.
- ☑ **9. Trust proxy / X-Forwarded-Host niet expliciet** — `main.ts`
  Achter een reverse proxy kan de hostname (en dus de tenant) gespooft worden. Fix:
  `app.set('trust proxy', 1)` bewust zetten en hostnames valideren.
- ☑ **10. Globale unique-constraints op per-org velden** — `schema.prisma`
  `quoteNumber` (:858), `projectNumber` (:1279), `workOrderNumber` (:1453) zijn `@unique`
  over álle tenants. Fix: `@@unique([orgId, <veld>])`. Vereist migratie.
- ☑ **11. Ontbrekende composite indexes** — `schema.prisma`
  `(orgId, status)` op Quote en Request, `(orgId)` op Contact — performance bij groei.
- ☑ **12. Password-reset JWT zonder e-mailbinding + invitation zonder rate limit**
  `auth.service.ts` (reset-token bevat alleen `sub`/`purpose`); `users.service.ts`
  (`acceptInvitation` ongelimiteerd). Fix: e-mail in reset-token binden + valideren;
  throttle op invitation-acceptance (deels gedekt door punt 7).
- ☑ **13. Portal localStorage niet per org-slug genamespaced** — `apps/portal`
  Table-config, sidebar-state en filters lekken tussen orgs in dezelfde browser (UX, geen
  security). Fix: prefix alle keys met `inspexi:${slug}:` via een gedeelde util.
- ☑ **14. iCal-token permanent en niet roteerbaar** — `planning-ical.service.ts`
  Per-user feed-token kan bij lekken niet ingetrokken worden. Fix: "token vernieuwen"-actie
  in de UI + toegang loggen.

---

## Gedeelde helper (punten 1–4)

`apps/api/src/common/utils/assert-same-org.ts`, geëxporteerd via `@/common`:

- `assertSameOrg(model, id, orgId, label?)` — valideert één optionele FK. `id` leeg → no-op;
  `orgId === null` (SUPERUSER) → no-op; entiteit niet gevonden → `NotFoundException`;
  andere org → `ForbiddenException`.
- `assertAllSameOrg(model, ids, orgId, label?)` — batch-variant voor arrays (klantgroepen,
  inspecteurs).

## Aanbevolen vervolg

- ☑ E2E-tests die expliciet cross-tenant FK-aanvallen proberen op planning, taken en contacten
  — `apps/api/test/cross-tenant.e2e-spec.ts` (org A injecteert org B's UUIDs → 403, met
  positieve same-org controls).
- ☑ Punten 8–14 opgepakt; 10 en 11 samen in één migratie (`20260612000000_multi_tenant_hardening`).
