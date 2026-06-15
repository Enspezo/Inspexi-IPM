# Fase 6 — Client-portal (4e app) + 2e auth-realm

Het externe klantportaal (opdrachtgevers: inspecties inzien, constateringen oplossen, ondertekenen, verzoeken indienen) als **4e app** in de Beheer-monorepo, plus de **tweede auth-realm** (`ClientUser`) in de API.

**Tenancy (vastgesteld):** **subdomein-gebaseerd, net als de Beheer-portal** — de org komt uit de hostname (TenantMiddleware). Reden: het moet uiteindelijk naar één portal convergeren. Een klant logt in binnen het org-subdomein en ziet alleen die org.

Deliverables in deze map (`code/`):
- `client-auth/` — `client-jwt` strategie, `ClientJwtAuthGuard`, `@CurrentClientUser`, service/controller/module/dto. **Security-kritisch.**
- `client-inspections/` — voorbeeld klant-endpoint met de tenant + ClientAccess-scoping.

## 1. Realm-integratie in Beheer's tenant-model (de kern)
Beheer's globale guards: `JwtAuthGuard` (staf) → `RolesGuard` → `TenantGuard`. Beide skippen `@Public()`-routes. `TenantMiddleware` zet `request.tenant` (orgId uit subdomein) **altijd**, ongeacht guards.

Patroon voor álle client-endpoints:
- **`@Public()` op de controller** → de staf-`JwtAuthGuard` + `TenantGuard` worden overgeslagen.
- **`@UseGuards(ClientJwtAuthGuard)`** voor de geauthenticeerde endpoints (de `client-jwt`-strategie zet `request.user` = ClientUser).
- **`@CurrentTenant('orgId')`** levert de org uit het subdomein → alle data-queries scopen daarop.
- Auth-secrets gescheiden: `CLIENT_JWT_SECRET` / `CLIENT_JWT_REFRESH_SECRET` (token `type: 'client'`).

**Scoping** (Fase 1-keuze: `ClientAccess → Contact`): een klant ziet inspectieplannen van Contacten in **deze org** waar hij `ClientAccess` op heeft, plus plannen met expliciete `InspectionClientAccess` (canView). Zie `client-inspections.service.ts` — dat patroon herhaalt voor alle client-endpoints.

> Afwijking van de App: die deed client-auth single-domain (geen org uit hostname). Hier loopt elke flow door de org-context van het subdomein. Login/magic-link verifiëren dat de klant toegang heeft tot een Contact in de huidige org.

## 2. Backend — modules (volgorde)
1. **client-auth** (`code/client-auth/`): strategie + guard + decorator + service + controller + module. Endpoints: `POST /client/auth/{login,register,magic-link,forgot-password,reset-password}`, `GET /client/auth/me`. Registreer `ClientAuthModule` in `app.module.ts`. **PORT** uit de App-bron: Resend-mail, reset-tokens, refresh-rotatie, en de `ClientAccess`/`InspectionClientAccess`-grant bij registratie via magic link.
2. **client-inspections** (`code/client-inspections/`): lijst + detail (scoping-voorbeeld).
3. **client-documents**: `GET /client/documents/:id` + `/download` (auth-stream of signed URL); `POST /client/documents/:id/sign` (DocumentSignature, base64) — sluit aan op Fase 4 `generated-documents`.
4. **client-findings**: `GET /client/findings/:id`, `POST /client/findings/:id/resolve` (+ `/photos` multipart via STORAGE_PROVIDER), `DELETE …/resolve` — maakt `FindingResolution` (+ photos).
5. **client-messages**: `GET/POST /client/inspections/:id/messages`, `POST …/:messageId/read` — `InspectionMessage`.
6. **client-requests**: `GET /client/requests(/:id)`, `POST /client/requests/{reinspection,new-assignment}` — `ClientRequest`.

Alle client-modules volgen het patroon uit §1 (`@Public()` + `ClientJwtAuthGuard` + `@CurrentTenant` + ClientAccess-scoping). PORT de business-logica uit `../Inspexi-App/apps/api/src/modules/client-*`.

## 3. Frontend — `apps/client-portal` (4e app)
Een eigen Vite/React-app, maar **bewust uitgelijnd op de Beheer-portal** (oog op convergentie):
- **Hergebruik de Beheer-portal-conventies**: `TenantProvider` (subdomein-branding/org-logo/kleuren), `apiClient`-stijl, TanStack Query, react-hook-form/zod, custom Tailwind v4-componenten (géén shadcn), de `useLookups`/`<LookupBadge>` (Fase 5) voor status/typen.
- **Eigen `ClientAuthProvider`** (los van de staf-AuthProvider): tokens in memory + refresh, `client-auth:logout`-event, hits `/client/auth/*`.
- **Pagina's** (port uit `../Inspexi-App/apps/client-portal`): `login`/`register`/`magic/:token`/`forgot`/`reset`, `dashboard`, `inspections` (lijst + detail met tabs Overzicht/Constateringen/Berichten/Documenten), constatering-resolutie (foto-upload), document-ondertekening (signature-canvas — Beheer heeft `signature-canvas.tsx`), `requests`(`/new`).
- **Convergentie-principe**: deel waar mogelijk types/utilities met de Beheer-portal (zodat samenvoegen later klein is); vermijd een afwijkende stack.

## 4. Env, registratie, deploy
- Env (`apps/api/.env.example`): `CLIENT_JWT_SECRET`, `CLIENT_JWT_REFRESH_SECRET`, `CLIENT_JWT_EXPIRATION` (1h), `CLIENT_JWT_REFRESH_EXPIRATION` (30d). Frontend: `VITE_API_URL`, evt. `CLIENT_PORTAL_PORT`.
- Registreer alle client-modules in `app.module.ts`.
- **Host-schema (subdomein-tenancy):** de client-portal moet op een host draaien waar TenantMiddleware de org-slug uit haalt (zelfde mechaniek als de Beheer-portal). Opties: een `klant.`-variant per org of een aparte client-base-domein met de slug. Bepaal dit als deploy-detail; de API-tenantresolutie blijft identiek (CORS-allowlist uitbreiden met het client-portal-domein).
- `pnpm-workspace.yaml`/`turbo.json`: voeg `apps/client-portal` toe.

## 5. Prompt L — backend client-realm (eigen branch)
```
Doel: bouw de 2e auth-realm + client-data-endpoints in apps/api (Beheer).

Branch & voorwaarden:
- git fetch --all --prune && git switch dev && git pull --ff-only
- git switch -c feat/client-auth-realm
- Verifieer dat Fase 1-4 op dev staan (ClientUser/ClientAccess/InspectionClientAccess in schema;
  apps/api/src/modules/generated-documents bestaat). Zo niet → STOP en meld.

Lees eerst: docs/fase6/FASE6-CLIENT-PORTAL.md (§1-2) + docs/fase6/code/, en als bron
../Inspexi-App/apps/api/src/modules/client-auth + client-{inspections,documents,findings,messages,requests}.

Stappen:
1. client-auth: kopieer strategie/guard/decorator/service/controller/module/dto uit docs/fase6/code;
   registreer ClientJwtStrategy; voeg CLIENT_JWT_*-env toe. PORT: Resend-mail, reset-tokens,
   refresh-rotatie, ClientAccess/InspectionClientAccess-grant bij magic-link-registratie.
2. client-inspections (uit docs/fase6/code) + client-documents/-findings/-messages/-requests volgens
   hetzelfde patroon (@Public + ClientJwtAuthGuard + @CurrentTenant + ClientAccess→Contact∩org-scope).
   Port de logica uit de App-bron. Foto's/handtekeningen via STORAGE_PROVIDER resp. Fase 4.
3. Registreer alle modules in app.module.ts.
4. Tests: unit (auth-scoping happy/forbidden) + e2e; cross-tenant: een klant van org A op org B's
   subdomein → 403/leeg; nooit data van een andere org.

Constraints: client-endpoints altijd @Public()+ClientJwtAuthGuard; orgId NOOIT uit het token maar uit
@CurrentTenant; alle queries scopen op org + ClientAccess. Aparte secrets; type:'client' in het token.

Definition of done: `npx turbo run build` + unit + e2e + cross-tenant groen. Commit op de branch;
push -u; gh pr create --base dev --title "Fase 6 — client-auth realm + client endpoints". Geen lokale merge.
```

## 6. Prompt M — client-portal frontend (eigen branch)
```
Doel: bouw apps/client-portal als 4e app, uitgelijnd op de Beheer-portal-conventies.

Branch & voorwaarden:
- git fetch --all --prune && git switch dev && git pull --ff-only
- git switch -c feat/client-portal-app
- Verifieer dat de client-realm-endpoints op dev staan (PR van Prompt L gemerged: /client/auth + /client/*).

Lees eerst: docs/fase6/FASE6-CLIENT-PORTAL.md (§3) + als bron ../Inspexi-App/apps/client-portal,
en als conventie-referentie de bestaande apps/portal (TenantProvider, apiClient, ui-componenten,
useLookups/LookupBadge, signature-canvas).

Stappen:
1. Scaffold apps/client-portal (Vite + React + TS), toegevoegd aan pnpm-workspace + turbo.
2. ClientAuthProvider (eigen, /client/auth/*), apiClient-variant, TenantProvider hergebruiken
   (subdomein-branding). Routes: login/register/magic/forgot/reset + dashboard + inspections(/:id)
   + documents/:id + requests(/new).
3. Pagina's porten uit de App-client-portal; status/typen via useLookups/LookupBadge; ondertekening
   via signature-canvas; foto-upload bij constatering-resolutie.
4. CORS in de API uitbreiden met het client-portal-domein; VITE_API_URL zetten.

Definition of done: build + typecheck groen; offline-vrije happy path: magic-link → login → inspectie
inzien → constatering oplossen (foto) → document ondertekenen → verzoek indienen, alles org-gescoped.
Commit op de branch; push -u; gh pr create --base dev --title "Fase 6 — client-portal app". Geen lokale merge.
```

## 7. Verificatie
- API build + tests groen; **cross-tenant**: klant van org A kan op org B's subdomein niets zien (403/leeg) — de hoeksteen van deze fase.
- Auth: login/magic-link werken binnen een org-subdomein; `/client/auth/me` toont alleen toegang in die org.
- Frontend: org-branding via TenantProvider; signing + foto-resolutie end-to-end.

## 8. Open punten
- **Host-schema** voor het client-subdomein (deploy-detail) — §4.
- **Convergentie naar één portal**: deze fase houdt de client-portal apart maar conventie-gelijk; een latere fase kan 'm als route-area in de Beheer-portal opnemen (gedeelde TenantProvider/ui). Plan dat apart.
- **ClientUser e-mail-uniciteit**: globaal uniek (Fase 1). Bij subdomein-tenancy kan dezelfde klant meerdere orgs bedienen via meerdere `ClientAccess` — bevestig of dat gewenst is, of dat e-mail per-org moet.
- **Notificaties** (nieuwe constatering-resolutie, bericht, verzoek) naar de backoffice via Beheer's NotificationsService — voeg `NotificationType`-waarden toe (aparte migratie).
