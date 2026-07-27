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
| A1 | — | — | open | B-211, B-208, B-223b | — |
| A2 | — | — | open | B-210, B-206, B-207, B-223d | — |
| A3 | `fix/wp-a3-document-chain` | [#133](https://github.com/Enspezo/Inspexi-IPM/pull/133) | ✅ gemerged + browser/curl-geverifieerd | B-101 ✔, B-102 ✔, B-103 ✔ (rolmatrix vastgelegd), B-104 ✔ (deels achterhaald — statuscheck bestond al, handtekeningcheck toegevoegd) | e2e-rolmatrix 21 tests, unit-specs sign/delete/patch |
| A4 | `fix/wp-a4-client-portal-assetnode` | [#132](https://github.com/Enspezo/Inspexi-IPM/pull/132) | ✅ gemerged + browser-geverifieerd | B-401 ✔ | 9 Vitest-componenttests (exacte servershape) + TabErrorBoundary |
| B4 | `fix/wp-b4-upload-security` | [#136](https://github.com/Enspezo/Inspexi-IPM/pull/136) | ✅ gemerged + live geverifieerd | B-507 ✔ (magic bytes, SVG eruit, headers, helmet, avatar mee) | 13 unit validator + 6 service, 15 e2e upload/download |
| B6 | `fix/wp-b6-pagination-contract` | [#137](https://github.com/Enspezo/Inspexi-IPM/pull/137) | ✅ gemerged + browser-geverifieerd | B-305 ✔ (cap 200, 14 call-sites in 9 bestanden — assets-page bleek níet kapot; systemische query-foutstate) | parametrische e2e 32 endpoints, 14 portal-tests |
| B7 | `fix/wp-b7-public-endpoints` | [#138](https://github.com/Enspezo/Inspexi-IPM/pull/138) | ✅ gemerged + live geverifieerd | B-306 ✔ (select-allowlist), B-152 ✔ (tenantbinding + service-gate) | key-snapshot-tests + 17 e2e public-endpoints |
| B8 | `fix/wp-b8-session-assign` | [#135](https://github.com/Enspezo/Inspexi-IPM/pull/135) | ✅ gemerged + browser-geverifieerd (BO-40 volledig) | B-310 ✔ | 8 portal-Vitest (assign/409-override/tooltip) |
| B3 | `fix/wp-b3-superuser-scoping` | [#141](https://github.com/Enspezo/Inspexi-IPM/pull/141) | ✅ gemerged + browser-geverifieerd (volledige onboardingketen) | B-502 ✔, B-503 ✔, B-504 ✔, B-511§1 ✔ | tenant-matrix unit, superuser-scoping e2e 14, regressie 151 |
| B5 | `fix/wp-b5-quote-chain` | [#142](https://github.com/Enspezo/Inspexi-IPM/pull/142) | ✅ gemerged + live geverifieerd | B-302 ✔, B-303 ✔, B-304 ✔, B-307 ✔, B-308 ✔, B-309 ✔, B-314 ✔, B-315-B ✔ | Promise.all-send-race, tiergrenzen, DTO-grenzen, self-approval, P2020/overflow; e2e 213 |
| B9 | `fix/wp-b9-client-portal-mitigations` | [#139](https://github.com/Enspezo/Inspexi-IPM/pull/139) | ✅ gemerged + browser-geverifieerd (gate + canSign op originele repro-plannen) | B-412 ✔, B-402 △ mitigatie, B-403 △ mitigatie, B-406a ✔ | review-gate e2e 10, client-portal vitest 36 |
| B1, B2, B10 | — | — | open (PWA-spoor, na A2) | — | — |
| C1–C5 | — | — | open (golf 3) | — | — |
| D1–D3 | — | — | open (golf 4) | — | — |

---

## Chronologisch logboek

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
