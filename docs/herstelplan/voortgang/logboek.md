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
| B1–B10 | — | — | open (golf 2) | — | — |
| C1–C5 | — | — | open (golf 3) | — | — |
| D1–D3 | — | — | open (golf 4) | — | — |

---

## Chronologisch logboek

### 27 juli 2026 — Golf 1 (deels) + Golf 2 gestart

- **WP-A4 gemerged** (PR #132): B-401 opgelost; browserverificatie: Constateringen-tab + detailmodal renderen op het demo-plan, console schoon.
- **WP-A3 gemerged** (PR #133): volledige acceptatiematrix live nagedraaid via curl (403/400/201/403/403/400 — alle zes conform) + portal-check (verwijderknop verborgen op getekende documenten als MANAGER). Migratie `20260727194732` (signed_by_user_id) op de dev-DB. Let op: na de merge moest de orkestrator-worktree `prisma generate` + API-herstart doen — de eerste 201-check gaf een 500 door een stale Prisma-client (omgevingsartefact, geen codefout).
- Restpunt uit A3 (voor het PWA-spoor): de PWA post `{signerRole}` i.p.v. `signerRoleCode` en krijgt al 400 — meenemen bij de PWA-cutover.
- Golf 2 gestart: B3 t/m B9 parallel als subagents (B5 = enige migrator, e2e-runs geserialiseerd via lock).

### 27 juli 2026 — Fase 0

- Basisbranch vastgesteld (zie boven).
- `docs/herstelplan/` + deze voortgangsstructuur gecommit op branch `docs/herstelplan`, gemerged naar `dev`.
- Statustabel in `00-herstelplan.md` §3 voorzien van een Status-kolom (alles `open`).
