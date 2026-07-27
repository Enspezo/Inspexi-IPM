# Uitvoerlogboek herstelplan

> Bijgehouden door de orkestrator. Per werkpakket: branch, PR, status, afgehandelde bevindingen, toegevoegde tests.

## Basisbranch-beslissing (Fase 0, 27 juli 2026)

- **Beheer-repo (`InspeXi-Beheer`):** basis = **`dev` @ `fc93372`**. Op het moment van starten bevatte `dev` al de merges van `feat/online-repair` (PR #128), `fix/sync-resolve-audit` (PR #129) én `test/smoke-programma` (PR #130, incl. `docs/testprogramma/` + `seed-testprogramma.ts`). De keuzevraag uit het plan ("dev ná het mergen van feat/online-repair") is daarmee feitelijk beantwoord: die merge was al gebeurd. Alle WP-branches takken af van `dev`.
- **PWA-repo (`Inspexi-App`):** basis = **`origin/dev` @ `bdc77eb`** — exact de commit waartegen het testprogramma draaide. De lokale `dev` liep achter (1d1a3df) en wordt bijgetrokken; de niet-gemergde feature-branch `test/barcode-scanner` (ab84671) blijft buiten de basis.
- **Docs:** `docs/testprogramma/` zat al in de basis (PR #130). `docs/herstelplan/` is in Fase 0 vanaf de werkkopie gecommit en naar `dev` gemerged (branch `docs/herstelplan`).

## Omgeving

Conform `docs/testprogramma/00-master-testplan.md` §5: API `:3001` (`NODE_ENV=test`), portal `:5173`, client-portal `:5174`, PWA `:5176`, Postgres `:5433`. Apps altijd via subdomein (`inspexidemo.localhost`, superuser via `mijn.localhost`). Seed: `seed.ts` (`SEED_DEMO=1`) + `seed-testprogramma.ts`; na elke seed de API herstarten (tenant-cache).

---

## Werkpakketten

| WP | Branch | PR | Status | Bevindingen | Tests toegevoegd |
|---|---|---|---|---|---|
| A1 | `fix/wp-a1-sync-errors-visible` (PWA) | [InspeXi #30](https://github.com/Enspezo/InspeXi/pull/30) | ✅ gemerged + browser-geverifieerd | B-211 ✔, B-208 ✔, B-223b ✔ (+ z-index-bannerbug, succes-banner-fix, tellerdekking alle entiteiten) | 7 SyncContext-Vitest (fake-indexeddb), Playwright sync-errors 2× met echte setOffline |
| A2 | `fix/wp-a2-data-loss-stop` (PWA) + `fix/wp-a2-sync-contract-tests` (Beheer) | [InspeXi #31](https://github.com/Enspezo/InspeXi/pull/31) + [#149](https://github.com/Enspezo/Inspexi-IPM/pull/149) | ✅ gemerged + Playwright-keten live groen | B-206 ✔, B-207 ✔, B-210 ✔, B-223d ✔ (+ Dexie v15-repair, client-FK-check, push-volgorde ouder→kind) | sync-contract-e2e 10, PWA-Vitest 165 (23 nieuw), Playwright data-loss-keten |
| A3 | `fix/wp-a3-document-chain` | [#133](https://github.com/Enspezo/Inspexi-IPM/pull/133) | ✅ gemerged + browser/curl-geverifieerd | B-101 ✔, B-102 ✔, B-103 ✔ (rolmatrix vastgelegd), B-104 ✔ (deels achterhaald — statuscheck bestond al, handtekeningcheck toegevoegd) | e2e-rolmatrix 21 tests, unit-specs sign/delete/patch |
| A4 | `fix/wp-a4-client-portal-assetnode` | [#132](https://github.com/Enspezo/Inspexi-IPM/pull/132) | ✅ gemerged + browser-geverifieerd | B-401 ✔ | 9 Vitest-componenttests (exacte servershape) + TabErrorBoundary |
| B4 | `fix/wp-b4-upload-security` | [#136](https://github.com/Enspezo/Inspexi-IPM/pull/136) | ✅ gemerged + live geverifieerd | B-507 ✔ (magic bytes, SVG eruit, headers, helmet, avatar mee) | 13 unit validator + 6 service, 15 e2e upload/download |
| B6 | `fix/wp-b6-pagination-contract` | [#137](https://github.com/Enspezo/Inspexi-IPM/pull/137) | ✅ gemerged + browser-geverifieerd | B-305 ✔ (cap 200, 14 call-sites in 9 bestanden — assets-page bleek níet kapot; systemische query-foutstate) | parametrische e2e 32 endpoints, 14 portal-tests |
| B7 | `fix/wp-b7-public-endpoints` | [#138](https://github.com/Enspezo/Inspexi-IPM/pull/138) | ✅ gemerged + live geverifieerd | B-306 ✔ (select-allowlist), B-152 ✔ (tenantbinding + service-gate) | key-snapshot-tests + 17 e2e public-endpoints |
| B8 | `fix/wp-b8-session-assign` | [#135](https://github.com/Enspezo/Inspexi-IPM/pull/135) | ✅ gemerged + browser-geverifieerd (BO-40 volledig) | B-310 ✔ | 8 portal-Vitest (assign/409-override/tooltip) |
| B3 | `fix/wp-b3-superuser-scoping` | [#141](https://github.com/Enspezo/Inspexi-IPM/pull/141) | ✅ gemerged + browser-geverifieerd (volledige onboardingketen) | B-502 ✔, B-503 ✔, B-504 ✔, B-511§1 ✔ | tenant-matrix unit, superuser-scoping e2e 14, regressie 151 |
| B5 | `fix/wp-b5-quote-chain` | [#142](https://github.com/Enspezo/Inspexi-IPM/pull/142) | ✅ gemerged + live geverifieerd | B-302 ✔, B-303 ✔, B-304 ✔, B-307 ✔, B-308 ✔, B-309 ✔, B-314 ✔, B-315-B ✔ | Promise.all-send-race, tiergrenzen, DTO-grenzen, self-approval, P2020/overflow; e2e 213 |
| B9 | `fix/wp-b9-client-portal-mitigations` | [#139](https://github.com/Enspezo/Inspexi-IPM/pull/139) | ✅ gemerged + browser-geverifieerd (gate + canSign op originele repro-plannen) | B-412 ✔, B-402 △ mitigatie, B-403 △ mitigatie, B-406a ✔ | review-gate e2e 10, client-portal vitest 36 |
| B1 | `fix/wp-b1-reference-sync` (PWA) + `fix/wp-b1-sheet-template-sections` (Beheer) | [InspeXi #32](https://github.com/Enspezo/InspeXi/pull/32) + [#155](https://github.com/Enspezo/Inspexi-IPM/pull/155) | ✅ gemerged + live geverifieerd (schoon toestel: alle 4 referentiecaches gevuld) | B-202 ✔, B-204 ✔, B-205a ✔ (+ locationTypes had helemaal géén fetch — gefixt, deblokkeert B2; defensieve asRecordData vooruitgetrokken uit D2) | 14 referentie-contracttests (Vitest), include=sections e2e 2, Playwright zonder harnas |
| B2 | — | — | in uitvoering | B-201, B-213, B-214, B-215, B-221, B-223c/f/g | — |
| B10 | — | — | open (na B2) | — | — |
| C1 | `fix/wp-c1-error-contract` | [#152](https://github.com/Enspezo/Inspexi-IPM/pull/152) | ✅ gemerged + live geverifieerd (404-oracle byte-identiek, NL 401/403/400, RoleRoute) | B-105 ✔ (39 sites), B-106 ✔, B-151 ✔, B-155 ✔ (494 callsites/63 controllers), B-501 ✔, B-509 ✔, B-601 ✔ | error-contract-e2e 21 (404-oracle + NL-sweep) |
| C5 | `fix/wp-c5-config-validation` | [#153](https://github.com/Enspezo/Inspexi-IPM/pull/153) | ✅ gemerged + live geverifieerd (publish-gate, KPI's, herseed schoon) | B-001 ✔, B-107 ✔, B-153 ✔, B-154 ✔, B-313 ✔ (+7 extra stille no-ops), B-315-rest ✔, B-505 ✔, B-506 ✔, B-508 ✔, B-510 ✔, B-511 §3-§7 ✔ | wp-c5-e2e 28, DTO↔mapping-regressietest, org-settings-schema 7 |
| C2 | `fix/wp-c2-client-hygiene` | [#147](https://github.com/Enspezo/Inspexi-IPM/pull/147) | ✅ gemerged + live geverifieerd | B-404 ✔, B-405 ✔, B-407 ✔, B-408 ✔, B-410 ✔, B-411 ✔; B-409 → beslispunt A4 | gedeelde SignatureImageDto-afdwinging, magic-link-race, 18+8 tests; fixte ook de kapotte feature-entitlements-e2e |
| C3 | `fix/wp-c3-sync-hardening` | [#150](https://github.com/Enspezo/Inspexi-IPM/pull/150) | ✅ gemerged (A2+C3 samen: 119 sync-unit + 28 e2e groen) | B-203 ✔, B-212 ✔, B-216 ✔, B-217 ✔ (A6: rol-guard — PWA stuurt velden mee), B-218 ✔; B-223a → beslispunt A3 | sync-errors-mapper, sync-hardening-e2e 9 |
| C4 | `fix/wp-c4-docgen-overflow` | [#148](https://github.com/Enspezo/Inspexi-IPM/pull/148) | ✅ gemerged + visueel geverifieerd (vóór/ná-PDF's + portal-tabellen) | B-311 ✔, B-312 ✔ (CJK = deploy-vereiste), B-301 ✔ | header-resolver-tests, table.test.tsx 9 |
| C1–C5 | — | — | open (golf 3) | — | — |
| D1–D3 | — | — | open (golf 4) | — | — |

---

## Chronologisch logboek

### 28 juli 2026 — GOLF 3 VOLLEDIG AF (C1–C5) + herseed gevalideerd

- **WP-C1 gemerged** (#152): 404-oracle live byte-identiek; NL-contract op 401/403/400/429; RoleRoute ("Geen toegang" voor MANAGER op /organizations). Integratieconflicten (controller @Ip×ParseUuidPipe; dubbel gebouwde RoleRoute C1×C5; tenant-middleware C5-structuur × C1-bodyshape) inhoudelijk opgelost; 2231 unit + 75 gerichte e2e groen op de combinatie.
- **WP-C5 gemerged** (#153): publish-gate live ("Veld 'SU18 omgekeerde grenzen' … minimum (100) … maximum (0) — corrigeer de grenzen"); dashboard-KPI's tonen echte cijfers; generieke DTO↔mapping-test ving 7 extra stille no-ops. Datachecks dev: 0 rijen (threshold=0, foute slugs); prod-queries als pre-deploy-stap in de PR.
- **Herseed gevalideerd**: seed draait schoon mét de B5/C5/A2-fixture-aanpassingen (TP-OFF-010 nu geldig; MS-SU17 bewust-fout CONCEPT en onpubliceerbaar; TP-plannen met inspectionTemplateId). API herstart; sessies vernieuwd.
- **Golf 3-terugkoppeling:** 32 bevindingen afgehandeld in C1–C5 (S3/S4-zwaartepunt): C1×7, C2×6, C3×5, C4×3, C5×11. Twee bewust doorgeschoven naar beslispunten: B-409 (A4), B-223a (A3). Risicogebied **R6 Validatie → GO** (B5+C1+C5: grenzen, NL-contract, config-validatie); **R1 Isolatie verder verstevigd** (404-oracle sluit het bestaans-orakel).

### 28 juli 2026 — GOLF 1 VOLLEDIG AF + C2/C3/C4 gemerged

- **WP-A2 gemerged** (InspeXi #31 + #149): alle vier bevindingen bevestigd en opgelost; volledige keten live bewezen (Playwright: checklist → wegnavigeren → antwoorden blijven → NOK → constatering → sync zonder errors, 3/3 groen tegen de gemergde stack). Dexie v15-repairhook voor bestaande toestellen zit erin.
- **Golf 1-terugkoppeling:** 12 bevindingen opgelost — **alle 5 S1's** (B-101, B-102, B-206, B-207, B-401), 5 S2 (B-103, B-104, B-208, B-210, B-211), 2 S3-subitems (B-223b/d). Risicogebieden: **R8 Documenten/tekenen → GO** (A3-rolmatrix + sign-validatie), **R4 Sync/offline → GO voor de kernfunctie** (zichtbare fouten + dataverlies-stop + contracttests + skew-hotfix; referentiedata volgt in B1/B2).
- **WP-C2 gemerged** (#147): incl. structurele afdwinging dat élke sign-route de veilige image-validator gebruikt; bonus: feature-entitlements-e2e-rootcause (kapot sinds B3-semantiek) gevonden en gefixt — volledige e2e-suite weer 1107/1107.
- **WP-C3 gemerged** (#150): A6 beantwoord (PWA stuurt reviewerId/assignedTo mee → echo-veilige rol-guard); sync-side-effects bij pending_review gedelegeerd (notificatie + AI-run); `assigned[]`-contractuitbreiding vastgelegd in FASE3-SYNC §9.
- **WP-C4 gemerged** (#148): header-placeholders opgelost (vóór/ná-PDF-bewijs), tabeloverflow + CJK-fontstacks (⚠️ deploy-vereiste `fonts-noto-cjk` in de Chromium-image), portal-truncatie live geverifieerd op de 223-tekens-relatie.
- Observatie (geen bug): PWA- en portal-logins delen de host-cookie `refresh_token` (zelfde staf-realm) — inloggen in de PWA vervangt de portal-sessie; de B6-foutzichtbaarheid maakte dat direct zichtbaar i.p.v. een leeg scherm.
- WP-B1 gestart (PWA-spoor).

### 28 juli 2026 — A1 gemerged + syncedAt-skew-hotfix; A2 gestart

- **Computerherstart** onderbrak de A1-agent en alle dev-servers; werk bleek volledig gepusht (3 commits), stack + agent hervat zonder verlies.
- **WP-A1 gemerged** (InspeXi PR #30). Browserverificatie orkestrator: teller direct op 1 bij mutatie (B-223b), rode banner "Synchronisatie mislukt" + "Probeer opnieuw" blijft staan bij gestopte API en rendert bóven de header (B-211), herstel via retry werkt; auto-sync bij reconnect Playwright-bewezen met echte setOffline (B-208).
- **Nieuwe bevinding uit A1 → direct gefixt** ([PR #144](https://github.com/Enspezo/Inspexi-IPM/pull/144)): `sync.service.ts` stempelde `syncedAt` ms vóór Prisma's `@updatedAt` → elk ooit gepusht record gaf bij de eerstvolgende edit vanaf een vers apparaat een vals zelf-conflict (trad live op tijdens de verificatie). Fix: één gedeelde stempel voor beide velden in push- én resolve-pad + regressietest + `scripts/backfill-synced-at-skew.ts` (dev: 2 rijen gerepareerd; **pre-deploy-stap voor productie, zie §8-lijst**). Tegenproef in de browser: tweede edit → sync → géén conflict.
- **WP-A2 gestart** (PWA + Beheer, twee PR's) op de verse basis mét A1 en de skew-fix.

### 27 juli 2026 — Golf 2: B3/B5/B9 gemerged (API/portal-kant compleet)

- **WP-B9** (PR #139): gate browser-geverifieerd op de originele repro's — demo-plan (draft) en TP Plan C (pending_review) tonen placeholder zónder Constateringen/Documenten-tabs; TP-RAP-005 (approved) toont alles mét "Ondertekening verloopt via de link in uw e-mail" bij canSign=false; dashboardtellers gefilterd.
- **WP-B3** (PR #141): volledige onboardingketen door de UI — org "Nieuwe Klant BV" aangemaakt, "Eerste beheerder uitnodigen", invite geaccepteerd op nieuweklantbv.localhost, ingelogd op /dashboard. Curl: SU op mijn.* ziet 19 users/7 orgs, op testbedrijf.* alleen die 2; POST /contacts als SU op org-subdomein → 201 (was 500). Bewuste afwijking: fix in TenantGuard (effectieve orgId) i.p.v. 92+90+200 callsite-migraties; helpers wél geleverd.
- **WP-B5** (PR #142): staffelgrenzen live exact (9→12,50 / 10→10,00 / 50→7,50 — was altijd tier 1); NL-grenzen op bedragen; approvalRequired geserialiseerd; "Ter goedkeuring" in het actiemenu (B-304-dead-end weg); migratie `quote_approval_self_approval_allowed` via drift-workaround (psql + migrate resolve) op de dev-DB. Merge-conflict in exception-filter (B3×B5) inhoudelijk opgelost: P2011- én P2020-tak, gecombineerde spec 20/20 groen. Drie agents fixten onafhankelijk dezelfde pre-existing quotes-e2e (TP-seed-manager-collision).
- Restpunt B5: DB bevat nog de oude TP-OFF-010-waarden (seedbestand is aangepast; herseed volgt bij golf-afronding). NB: sessie-invalidatie na herseed.

### 27 juli 2026 — Golf 2: B4/B6/B7/B8 gemerged

- **WP-B8** (PR #135): BO-40-pad volledig in de browser doorlopen — toewijzen (met PRD-12-beschikbaarheidsbadges) → bevestigen → DEFINITIEF (2/2).
- **WP-B4** (PR #136): live matrix — evil.svg/%PDF-als-PNG → 400 NL, echte PNG → 201, download-headers nosniff/CSP/inline, Swagger + doc-preview werken onder helmet. Datacheck dev: 0 SVG-logo's. Pre-deploy-stap prod in PR-body.
- **WP-B6** (PR #137): live — /contacts|/quotes|/assets|/tasks|/products?limit=200 → 200, limit=201 → 400; "Nieuwe inspectie"-modal toont 9 opdrachtgevers (was leeg). Correcties op de bevinding: 14 kapotte call-sites in 9 bestanden; assets-page was níet kapot. Nieuw pre-existing punt: ongebonden limit op /help/articles en /support-tickets.
- **WP-B7** (PR #138): live — publieke planning-payload = exacte allowlist zónder internalNotes (op een regel mét notities), verstuurde offerte eigen subdomein 200 / testbedrijf-subdomein 404 (ook PDF); publieke afspraakpagina rendert zonder Opmerkingen-blok. **PUBLIC_URL-bevinding**: gemailde links zijn generiek (apex) → apex-binding bewust open gelaten (één-regel-omkeerbaar in `publicTenantWhere()`); zie restrisico.
- Golf 1-restant: A1 (PWA) loopt nog; A2 in wachtrij.

### 27 juli 2026 — Golf 1 (deels) + Golf 2 gestart

- **WP-A4 gemerged** (PR #132): B-401 opgelost; browserverificatie: Constateringen-tab + detailmodal renderen op het demo-plan, console schoon.
- **WP-A3 gemerged** (PR #133): volledige acceptatiematrix live nagedraaid via curl (403/400/201/403/403/400 — alle zes conform) + portal-check (verwijderknop verborgen op getekende documenten als MANAGER). Migratie `20260727194732` (signed_by_user_id) op de dev-DB. Let op: na de merge moest de orkestrator-worktree `prisma generate` + API-herstart doen — de eerste 201-check gaf een 500 door een stale Prisma-client (omgevingsartefact, geen codefout).
- Restpunt uit A3 (voor het PWA-spoor): de PWA post `{signerRole}` i.p.v. `signerRoleCode` en krijgt al 400 — meenemen bij de PWA-cutover.
- Golf 2 gestart: B3 t/m B9 parallel als subagents (B5 = enige migrator, e2e-runs geserialiseerd via lock).

### 27 juli 2026 — Fase 0

- Basisbranch vastgesteld (zie boven).
- `docs/herstelplan/` + deze voortgangsstructuur gecommit op branch `docs/herstelplan`, gemerged naar `dev`.
- Statustabel in `00-herstelplan.md` §3 voorzien van een Status-kolom (alles `open`).
