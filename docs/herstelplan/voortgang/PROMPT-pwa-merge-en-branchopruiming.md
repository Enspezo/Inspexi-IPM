# Claude Code-prompt — F1 mergen + oude PWA-branches beoordelen

> Plak alles onder de streep in Claude Code, **vanuit de PWA-repo** `~/VIBE/Inspexi-App`.
> Beheer is compleet (`dev` @ `c8c4db1`, geen open branches). Deze opdracht gaat alleen over de PWA.

---

Twee dingen: één openstaande PR mergen, daarna vijf oude branches beoordelen en opruimen.

**Werk niet op `dev`** behalve om te syncen en te mergen.

## Deel 1 · F1 alsnog mergen

`fix/pwa-login-network-error` (commit `1e1ffcb` — NL-foutmeldingen bij onbereikbare server) is gereviewd en goedgekeurd, maar nooit gemerged: `origin/dev` staat nog op `0842c92`. De correctieronde speelde zich in de Beheer-repo af, waardoor deze stap buiten beeld viel.

```bash
cd ~/VIBE/Inspexi-App
git checkout dev && git pull --ff-only origin dev
git merge --no-ff fix/pwa-login-network-error
pnpm install && pnpm build      # shared-package eerst
pnpm test                       # Vitest, incl. de 4 nieuwe apiClient-tests
git push origin dev
```

Pas doorgaan naar deel 2 als de suite groen is.

## Deel 2 · Vijf oude branches beoordelen

Deze vijf staan niet in `dev` en dateren van vóór het herstelprogramma (28 juni – 2 juli). Ze zijn waarschijnlijk via een rebase of squash gemerged, waardoor de commits geen ancestor zijn terwijl de inhoud wél op `dev` staat. Gebruik dezelfde methode als bij de Beheer-opruiming: **beoordeel op inhoud, niet op commit-historie.**

Ik heb alvast een indicatie gemeten met `git diff --name-only origin/dev...origin/<branch>`:

| Branch | Unieke commits | Bestanden anders dan `dev` | Verwachting |
|---|---|---|---|
| `fix/pwa-sync-robustness-h9` | 1 | **0** | inhoud volledig op `dev` → verwijderen |
| `test/pwa-core-e2e-and-sync` | 1 | **0** | inhoud volledig op `dev` → verwijderen |
| `feat/pwa-v3-asset-node` | 2 | 6 | uitzoeken |
| `fix/pwa-sync-safety-net` | 1 | 9 | uitzoeken |
| `feat/pwa-login-subdomain-tenant` | 2 | 9 | uitzoeken — bevat dezelfde commit `8ee7524` als `sync-safety-net`, dus die twee overlappen |

**Verifieer dit zelf** — vertrouw mijn meting niet blind.

### Werkwijze per branch

1. `git log origin/dev..origin/<branch>` — welke unieke commits zitten erin?
2. `git diff origin/dev...origin/<branch>` — wat verschilt er inhoudelijk?
3. Is de diff leeg → de inhoud zit op `dev`, branch mag weg.
4. Is de diff niet leeg, beoordeel dan **per verschil** welke kant nieuwer is. Let op: `dev` heeft sinds die branches het hele herstelprogramma doorlopen (contract v4, Dexie v18, referentiedata-sync, assetboom-herbouw). Een verschil betekent dus veel vaker "de branch is verouderd" dan "de branch heeft iets wat `dev` mist".
5. Zoek expliciet naar unieke waarde die op `dev` ontbreekt: een test, een edge-case-fix, een comment die een beslissing vastlegt. Vind je die, cherry-pick hem dan naar een verse branch vanaf `dev` (`fix/pwa-branch-salvage-<onderwerp>`) mét test, in plaats van de oude branch te mergen — die zou verouderde code terugbrengen.

**Merge deze branches niet.** Ze takken af van een `dev` van vóór 22 werkpakketten; een merge introduceert regressies in precies de code die het herstelprogramma heeft gerepareerd.

### Bijzondere aandacht

- **`feat/pwa-v3-asset-node`** — raakt de AssetNode-boom en `nodeNumber`, precies het terrein van WP-A2/B1/B2 en het v3→v4-contract. Controleer of de "server-assigned nodeNumber (read-only)"-logica en de Dexie-index-fix inmiddels op `dev` staan (waarschijnlijk wel, via de latere sync-pakketten).
- **`fix/pwa-sync-safety-net`** en **`feat/pwa-login-subdomain-tenant`** — de `contractVersion`-guard uit `8ee7524` is inmiddels vervangen door de v4-guard in `pull.ts`. Controleer of de andere onderdelen van die commit (logout-wis, SW-cache, tombstone-/conflictbescherming) ook op `dev` zitten; conflicthantering is sindsdien fors herzien in WP-D1.

### Opruimen

Voor elke branch waarvan de inhoud aantoonbaar op `dev` staat:

```bash
git push origin --delete <branch>
git branch -D <branch>          # als er een lokale kopie is
```

## Rapporteer terug

Per branch: unieke commits, wat de inhoudsvergelijking opleverde, conclusie (verwijderd / gered via cherry-pick / bewust laten staan met reden). Plus de merge-status van F1 en of de Vitest-suite groen is.

Leg de uitkomst vast in `~/VIBE/InspeXi-Beheer/docs/herstelplan/voortgang/logboek.md` — dezelfde plek waar de Beheer-branchopruiming is genoteerd, zodat beide repo's één spoor delen.
