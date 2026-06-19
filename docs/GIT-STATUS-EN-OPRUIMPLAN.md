# Git-status & opruimplan — naar schone dev-branches

> ⚠️ **Kanttekening:** dit overzicht is gemaakt vanuit een omgeving die **niet kan `git fetch`en** (geen netwerk/credentials). De `origin/*`-referenties zijn een **momentopname van de laatste fetch**; de echte GitHub-staat kan nieuwer zijn. Stap 0 (hieronder) haalt de waarheid op — draai die eerst.

## TL;DR
- **Al het Fase 1-4 werk staat op feature-branches, niet op `dev`** (in de snapshot). Beide repo's hebben bovendien **ongecommitte / onge-pushte** wijzigingen.
- **Beheer**: alles zit op `feat/db-optimizations`; de laatste 3 commits (Fase 3 + 4) zijn **niet gepusht**.
- **PWA**: de v2-sync staat op `feat/v2-sync-contract-pwa` (lokaal, **niet gepusht**); de PWA-fixup is **niet gecommit**; deze branch is gebaseerd op een **verouderde dev** (mist de enums-to-lookup-PR's die al op dev staan) → conflicten te verwachten.

---

## Stap 0 — haal de echte staat op (eerst doen)
```bash
# Beheer
cd ~/VIBE/InspeXi-Beheer && git fetch --all --prune
git log --oneline origin/dev | head -20
git branch -a --contains 88c9dbb   # Fase 2-code — staat dit AL op origin/dev?

# PWA
cd ~/VIBE/Inspexi-App && git fetch --all --prune
git log --oneline origin/dev | head -20
git branch -a --contains 1b1b250   # Dexie v8 (v2) — staat dit AL op origin/dev?
```
Als `--contains` `origin/dev` toont, is dat deel al gemerged en sla je dat over. Zo niet → volg het plan.

---

## A. BEHEER (`InspeXi-Beheer`)

### Status (snapshot)
| Branch | Tip | Bevat | Op origin? | Op dev? |
|---|---|---|---|---|
| `feat/db-optimizations` (HEAD) | `ca76886` | **Fase 1-4 compleet** | ahead 3 (Fase 3+4 **niet gepusht**) | nee |
| `dev` (lokaal) | `2fbc774` | oud | behind 7 op origin/dev | — |
| `inspectie-integratie` | `2fbc774` | leeg/oud | — | — |

- Onge-pushte commits: `dfbedcf` (Fase 3 sync), `f80f3a1` (Fase 4 render+templates), `ca76886` (Fase 4 generated-docs+signing).
- Ongetrackt: `docs/fase3/PWA-FIXUP-PROMPT.md`.
- `origin/dev` kreeg eerder PR #10/#11 vanuit `feat/db-optimizations` — maar (in de snapshot) **vóór** de Fase-code. Verifieer met stap 0.

### Opruimplan
```bash
cd ~/VIBE/InspeXi-Beheer
git switch feat/db-optimizations
git add docs/fase3/PWA-FIXUP-PROMPT.md
git commit -m "docs: PWA typecheck fixup prompt (Fase 3)"
git push origin feat/db-optimizations          # pusht ook de 3 Fase 3/4-commits

# één PR die al het ontbrekende Fase 1-4 werk naar dev brengt
gh pr create --base dev --head feat/db-optimizations \
  --title "Fase 1-4 — inspectiedomein-integratie (schema, API, sync, doc-gen)"
# merge via GitHub → dev is compleet
```
> `feat/db-optimizations` bevat alles en `dev` heeft geen divergente eigen commits (de recente dev-commits kwámen uit deze branch), dus deze PR merget schoon. Optioneel achteraf: lokale `dev` bijwerken (`git switch dev && git pull`) en `inspectie-integratie` opruimen (`git branch -d inspectie-integratie`).

---

## B. PWA (`Inspexi-App`)

### Status (snapshot)
| Branch | Tip | Bevat | Gepusht? | Op dev? |
|---|---|---|---|---|
| `feat/v2-sync-contract-pwa` (HEAD) | `9f24e43` | Dexie v8, sync v2, classificatie, renames, round-trip | **nee (lokaal)** | nee |
| `feat/v2-reference-types-pwa` | `399d0a4` | reference/lookup-types v2 | nee (lokaal) | nee |
| `feat/enums-to-lookup-tables` | `ee4c643` | lookup-cache/badges | ja (PR #3) | **ja — klaar** |
| `dev` (lokaal) | `4816abc` | verouderd | ahead 1 / **behind 9** | — |

- **Ongecommit** op de werkboom (de PWA-fixup!): `SignatureSheet.tsx`, `CompleteInspectionPage.tsx`, `AssetTree.tsx`, `LocationAssetTree.tsx`, `packages/shared/src/types/index.ts`.
- `origin/dev` is **9 commits vooruit** op lokale dev (PR #1-3: bulk-filters, temp-cleanup, **enums-to-lookup**). De v2-sync-branch is van de oude dev afgetakt → die mist dit en raakt deels dezelfde bestanden (shared types, classificatie/lookup) → **conflicten verwachten**.

### Opruimplan
```bash
cd ~/VIBE/Inspexi-App
git fetch --all --prune

# 1. commit de losse fixup op de v2-branch
git switch feat/v2-sync-contract-pwa
git add -A
git commit -m "fix(pwa): v2 typecheck — asset status map + signature shape (Fase 3)"

# 2. rebase op de ACTUELE dev (haalt de enums-to-lookup-werk binnen, lost overlap op)
git rebase origin/dev
#   verwachte conflicten: packages/shared/src/types/index.ts + classificatie/lookup-bestanden.
#   los op (behoud v2-veldnamen), dan: git rebase --continue
pnpm typecheck   # bevestig groen na rebase

# 3. push + PR
git push -u origin feat/v2-sync-contract-pwa
gh pr create --base dev --head feat/v2-sync-contract-pwa --title "PWA — v2-synccontract + fixup"

# 4. feat/v2-reference-types-pwa: idem (rebase op origin/dev → PR), of eerst in de sync-branch
#    mergen zodat het één PR wordt. Daarna opruimen:
git branch -d feat/enums-to-lookup-tables   # al op dev via PR #3
```
> Let op de lokale `dev` "ahead 1" (`4816abc` backlog-doc): die commit zit niet op origin/dev. Hij rijdt mee in de PR (de v2-branch is erop gebaseerd); controleer of je 'm wilt behouden (`git log origin/dev..dev`).

---

## C. Eindstand voor handmatig testen
Na de PR-merges in beide repo's:
1. **Beheer** `dev`: `git switch dev && git pull` → `pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed && npx turbo run build` → API + portal draaien met Fase 1-4.
2. **PWA** `dev`: `git switch dev && git pull` → `pnpm install && pnpm typecheck` → `VITE_API_URL` naar de Beheer-API → `pnpm dev`.
3. Rooktest: login → inspectieplan → assets/findings → sync pull/push → foto-upload → document genereren/ondertekenen.

## D. Aanbevelingen tegen herhaling
- **Eén branch per fase, één PR per fase** (niet alles op `feat/db-optimizations` stapelen).
- Branch altijd vanaf de **actuele `origin/dev`** (`git switch -c feat/x origin/dev`), niet vanaf een lokale stale dev.
- Na elke sessie meteen committen + pushen + PR openen (geen losse werkboom-wijzigingen laten staan).
- Lokale `dev` puur als spiegel van `origin/dev` houden (geen directe commits erop).
