# PRD-12 — Claude Code prompt

Kant-en-klare prompt voor zelfstandige implementatie van PRD-12. Plak in Claude Code (met of zonder `/goal`-prefix, afhankelijk van of dat command geïnstalleerd is).

---

```
/goal Implementeer PRD-12 "Beschikbaarheid Inspecteurs" volledig en zelfstandig.

## Opdracht
Implementeer het complete beschikbaarheidssysteem voor inspecteurs volgens:
- docs/IMP_PRD_12_Beschikbaarheid-Inspecteurs.md (functioneel + technisch ontwerp)
- docs/IMP_PRD_12_Implementatieplan.md (bindende fasering 1–4)

Beide documenten zijn leidend; alle ontwerpbeslissingen zijn al genomen. Stel geen
vragen — bij ambiguïteit kies je de oplossing die het best aansluit bij de bestaande
patterns in CLAUDE.md.

## Branch & commits
- Start vanaf dev: `git checkout dev && git pull && git checkout -b feat/inspector-availability`
- Commit per afgeronde fase (Engels, korte samenvatting, Co-Authored-By Claude):
  `feat: implement PRD-12 phase N — <onderwerp>`
- Na groene eindverificatie (fase 4): merge de feature branch in dev en push.

## Werkwijze met subagents (Opus)
Gebruik voor elk zwaar deelwerk een subagent met model opus. Fases zijn strikt
sequentieel (elke fase bouwt op de vorige) — nooit parallel:
1. Fase 1: schema, migratie, seed, templates- & schedule-API — één opus subagent
2. Fase 2: excepties + resolutie-engine — één opus subagent; schrijf de unit-tests
   voor de interval-wiskunde VÓÓR de endpoints (dit is het risicozwaartepunt)
3. Fase 3: portal-UI (templates-beheer, beschikbaarheid-tab, mijn-beschikbaarheid,
   maandkalender) — één opus subagent
4. Fase 4: planning-integratie (soft warnings + override + kalender-overlay) — één
   opus subagent

Na elke fase: een aparte opus review-subagent die de volledige fase-diff controleert op
(a) volledigheid t.o.v. het PRD en (b) de conventies uit CLAUDE.md — shared utils
(paginate/orgScope/assertFound/assertSameOrg), route-volgorde, expliciete
isDeleted-filters, NL-labels/foutmeldingen, audit-registratie, seed-opruimvolgorde.
Bevindingen direct fixen vóór de fase-commit.

## Verificatie (verplicht per fase, zie implementatieplan)
- `npx turbo run build` vanuit de root
- `cd apps/api && pnpm test && pnpm test:e2e` (e2e serieel; nooit twee runs tegelijk)
- Fase 3/4 ook: portal Vitest + de browser-smoketests uit het implementatieplan
- Een fase is pas klaar als alles groen is. Ga nooit door met falende tests; los eerst op.

## Harde regels
- NOOIT `prisma db push` — altijd `npx prisma migrate dev --name <naam>` vanuit apps/api/
- Raak de bestaande chat-presence enum `Availability` (User.availability) niet aan
- `pnpm db:seed` wist de hele DB incl. users; API kan daarna een stale tenant-cache
  hebben → API herstarten
- De PWA-repo (../Inspexi-App) blijft volledig onaangeraakt
- Bij dev-server herstart eerst: `lsof -ti:3000 -ti:3001 -ti:5173 | xargs kill -9`
- Volg alle overige conventies en gotchas uit CLAUDE.md

## Definition of done
Alle 4 fases afgerond incl. eindverificatie uit het implementatieplan (build, unit,
e2e, portal-tests, browser-smoketest end-to-end: blokkade → inplannen → waarschuwing →
override → history-record), CLAUDE.md bijgewerkt met het nieuwe domein, feature branch
gemerged in dev en gepusht.
```
