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
| A3 | — | — | open | B-101, B-102, B-103, B-104 | — |
| A4 | — | — | open | B-401 | — |
| B1–B10 | — | — | open (golf 2) | — | — |
| C1–C5 | — | — | open (golf 3) | — | — |
| D1–D3 | — | — | open (golf 4) | — | — |

---

## Chronologisch logboek

### 27 juli 2026 — Fase 0

- Basisbranch vastgesteld (zie boven).
- `docs/herstelplan/` + deze voortgangsstructuur gecommit op branch `docs/herstelplan`, gemerged naar `dev`.
- Statustabel in `00-herstelplan.md` §3 voorzien van een Status-kolom (alles `open`).
