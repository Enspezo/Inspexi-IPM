# Claude Code-prompt — release-merge `dev` → `main`

> Plak alles onder de streep in Claude Code, vanuit de repo-root `InspeXi-Beheer`.

---

Je voert de release-merge `dev` → `main` uit. `dev` is de bron van waarheid: alle 22 werkpakketten, de audit-opvolging en de #124-port zitten erin. Doe dit **niet** als een gewone merge — er zit een valkuil in die een standaardstrategie niet afvangt.

## Context

`main` heeft 12 commits die geen ancestor van `dev` zijn (PR #124 AI-agent en PR #105 auth/storage-hardening). Beide zijn inhoudelijk al in `dev` aanwezig: #124 via de bewuste port (PR #178, met de gedeelde `AnthropicClientService` in plaats van de eigen provider), #105 via een andere route. **Verifieer dat zelf opnieuw** voordat je merget — vertrouw deze samenvatting niet:

```bash
git fetch --prune origin
# H1
git show origin/dev:apps/api/src/common/services/storage/local-storage.provider.ts | grep -c 'Ongeldige storage-key'
git ls-tree -r --name-only origin/dev | grep -E 'storage-key.util|sanitize-storage'
# H4
git ls-tree -r --name-only origin/dev | grep validate-jwt-secrets
# H5
git show origin/dev:apps/api/src/modules/auth/auth.service.ts | grep -cE "type: 'access'|pwStamp"
# K3
git show origin/dev:apps/api/prisma/seed.ts | grep -c SEED_DEMO
# AI-agent geport
git ls-tree -r --name-only origin/dev -- apps/api/src/modules/ai-agent | head
```

Ontbreekt er iets → **stop en meld het**, dan is de merge niet veilig.

## De valkuil

Er zijn **14 bestanden die alleen op `main` bestaan**. Die geven geen conflict en worden bij een gewone merge stilzwijgend toegevoegd. Een strategie als `-X theirs`/`-X ours` helpt niet — die werkt alleen op conflicterende hunks.

```bash
git diff --name-status origin/dev origin/main -- ':!docs' ':!*.md' | awk '$1=="A"{print $2}'
```

Verwacht (verifieer; de lijst kan gewijzigd zijn):
- `apps/api/src/modules/ai-agent/ai-anthropic.provider.ts` — de eigen Anthropic-provider die bij de port is vervangen door `AnthropicClientService`. Nul referenties op `dev`; zou terugkomen als dode code.
- 13× `apps/portal/src/components/ui/*.tsx` (button, card, checkbox, confirm-dialog, error-box, info-field, input, modal, select, signature-canvas, spinner, tabs, toast) — op `dev` verhuisd naar `packages/ui`. Zouden als duplicaten terugkomen naast de nieuwe, met kans dat imports naar de verkeerde resolven.

## Uitvoeren

Doel: een merge-commit met **beide ouders** in de historie, waarvan de tree **exact gelijk** is aan `dev`.

```bash
git checkout main
git pull --ff-only origin main
git merge --no-commit --no-ff dev
git read-tree -u --reset dev          # tree wordt exact die van dev
git commit -m "release: sync main with dev (22 werkpakketten + audit-opvolging + #124-port)"
```

## Verifiëren vóór je pusht

```bash
git diff --stat dev main              # MOET LEEG ZIJN — anders is er iets van main blijven hangen
git log --oneline -1 --merges main    # merge-commit met 2 ouders
git rev-list --count main..dev        # 0
```

Draai daarna een volledige build en de suites op `main`:

```bash
pnpm install
npx turbo run build                   # 6/6
pnpm --filter api test                # unit
pnpm --filter api test:e2e            # e2e (database nodig)
pnpm --filter portal test
```

Pas pushen als `git diff --stat dev main` leeg is én de build groen.

```bash
git push origin main
```

## Daarna: stale branches opruimen

Vier remote branches zitten niet in `dev`. Twee zijn nu achterhaald en kunnen weg:

```bash
git push origin --delete claude/ai-agent-backoffice-prd-dsnivl   # vervangen door de port (#178)
git push origin --delete fix/auth-storage-hardening              # inhoud zit in dev (H1/H4/H5/K3)
```

Twee **niet** zomaar verwijderen:
- `feat/req1-internal-chat` — raakt functioneel Epic 1 (stafzijde berichtenkanaal) uit `03-beslispunten-backlog.md`. Bekijk of er herbruikbaar materiaal in zit en noteer dat in de epic vóór je 'm opruimt.
- `feat/help-system-fase4` — oud, pre-herstelplan. Beoordeel apart.

## Buiten scope van deze taak

De **deploy** zelf is een aparte stap: volg `docs/herstelplan/RUNBOOK-DEPLOY.md` (migrate deploy → handmatig skew-script → datachecks → image mét `fonts-noto-cjk` → PWA ná de API → `NODE_ENV=production` → post-checks). Voer die niet uit als onderdeel van deze merge.

## Rapporteer terug

De uitkomst van `git diff --stat dev main`, welke van de 14 orphan-bestanden je hebt aangetroffen, de buildstatus, en welke branches je hebt opgeruimd.
