# Testlogboek — InspeXi autonoom testprogramma

Uitvoering: worktree `InspeXi-Beheer-test` (branch `test/smoke-programma`) + `Inspexi-App-test`.
Stack: API :3001 (`NODE_ENV=test`), portal :5173, client-portal :5174, PWA :5176, Postgres :5433.
Startdatum: 2026-07-27.

Formaat: `ID | PASS/FAIL/BLOCKED/SKIP | opmerking`

> **Dit bestand bevat alleen de setup-fase.** De testgevallen zelf staan per actor in een eigen logboek:
> `logboek-SEC-A.md` (SEC-01..09), `logboek-SEC-B.md` (SEC-10..18), `logboek-INS.md`, `logboek-BO.md`,
> `logboek-KL-PUB.md`, `logboek-SU-OA.md` en `logboek-THROTTLE.md`.
> Eindoordeel en tellingen: **`SAMENVATTING.md`**.

---

## Fase 0 — setup

| ID | Status | Opmerking |
|---|---|---|
| SETUP-01 | PASS | Worktrees aangemaakt: `InspeXi-Beheer-test` (van `dev` ba7d9bb), `Inspexi-App-test` (van `origin/dev` bdc77eb, bevat v3-AssetNode-cutover) |
| SETUP-02 | PASS | `pnpm install` beide worktrees; workspace-packages moesten handmatig gebouwd worden (`@inspexi/entitlements`, `@inspectie/shared`) — anders start API/PWA niet |
| SETUP-03 | PASS | Postgres :5433 draait (gedeeld), `prisma migrate status` = up to date |
| SETUP-04 | PASS | Poorten 3001/5173/5174/5176 vrijgemaakt en opnieuw bezet door de test-worktree |
| SETUP-05 | PASS | Loginscherm portal `inspexidemo.localhost:5173` — tenant-branding "InspeXi Demo" |
| SETUP-06 | PASS | Loginscherm client-portal `inspexidemo.localhost:5174` — "InspeXi Klantportaal" |
| SETUP-07 | PASS | Loginscherm PWA `inspexidemo.localhost:5176` — "Inspectie App", online-indicator |
| SETUP-08 | PASS | Superuser-domein `mijn.localhost:5173` — branding "InspeXi Beheer" (geen org) |
| SETUP-09 | PASS | Alle 8 staf-logins uit de seed werken via `POST /auth/login` (incl. superuser op `mijn.localhost`) |
| SETUP-10 | PASS | PWA-proxy `:5176/api/v1` bereikt de API; `sync/pull` geeft `contractVersion: 3` — gelijk aan de `CONTRACT_VERSION = 3` van de PWA, dus géén mismatch (INS-42 moet gesimuleerd worden) |
| SETUP-11 | PASS | Client-magic-link `demo-klant-magic` levert een clienttoken; herstel-lookup `RAP-2026-001` + `1234AB` levert een ACTIVE sessie (72u) |
| SETUP-12 | PASS | Puppeteer/Chromium start en rendert een PDF (18.942 bytes, incl. emoji/CJK) → PDF-export (BO-48) is uitvoerbaar; convert-api luistert op :3002 voor DOCX |
| SETUP-13 | PASS | Portal-login `manager@inspexi-demo.nl` → dashboard "Welkom terug, Pieter!"; geen console-fouten, alle API-calls 200 |

**Observatie tijdens SETUP-13 (te verifiëren door de BO/OA-tester):** de vier dashboard-KPI-tegels
("Actieve inspecties", "Gebruikers", "Openstaande taken", "Rapporten") tonen permanent `--` en er wordt
géén enkele statistiek-call gedaan (netwerklog bevat alleen tasks/notes/chat/notifications/audit-logs).
Kandidaat-bevinding: KPI's zijn placeholders zonder databron.

**Tooling-notitie voor browser-testers:** `read_page` (accessibility-tree) geeft in deze omgeving een
lege boom terug. Werk met `computer{action:"screenshot"}` + coördinaten en `get_page_text`; verifieer
statuscodes met `read_network_requests` en JS-fouten met `read_console_messages`.

**Bekende omgevingsbeperkingen (vooraf, beïnvloedt verwachtingen):**
- Géén `ANTHROPIC_API_KEY` in `apps/api/.env` → `GET /ai-review/status` geeft `available:false`. AI-review-testgevallen worden SKIP met reden; voice-parsing idem.
- API draait met `NODE_ENV=test` → throttling uit. PUB-15 en SEC-19..21 draaien apart met normale env (fase 2c).
- Postgres :5433 is gedeeld met de hoofd-checkout; er draait geen tweede testrun.

---
