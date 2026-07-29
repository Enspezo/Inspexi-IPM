# Claude Code-prompt — salvage-PR afronden en mergen

> Plak alles onder de streep in Claude Code, **vanuit de PWA-repo** `~/VIBE/Inspexi-App`.
> Basis: PWA `origin/dev` @ `9417efa`. Branch onder handen: `fix/pwa-branch-salvage-sync-vangnet` (2 commits).

---

De salvage-PR is gereviewd. Hij is procedureel goed uitgevoerd — verse branch vanaf de `dev`-tip, geen merge van de oude branch, code geherformuleerd op de huidige architectuur in plaats van blind gecherry-pickt. Er zijn drie acties vóór de merge, en één daarvan is urgent.

## S1 · Urgent: `dev` staat rood op typecheck

PR #41 (F1) introduceerde 9× `TS18046 'err' is of type 'unknown'` in `apps/inspectie-app/src/services/api/__tests__/apiClient.test.ts` — `.catch((e) => e)` levert onder `strict` een `unknown` op. Er is geen CI-workflow in de repo, dus niets blokkeerde het.

Commit `54883dd` in deze branch repareert dat al, correct en minimaal. Haal hem **los** naar `dev` zodat hij niet wacht op de rest:

```bash
git checkout dev && git pull --ff-only origin dev
git cherry-pick 54883dd
pnpm typecheck          # moet nu schoon zijn
git push origin dev
```

Verifieer eerst zelf dat `dev` daadwerkelijk rood staat (`pnpm typecheck` vóór de cherry-pick). Is dat niet zo, meld dat dan.

Rebase daarna de salvage-branch op de nieuwe `dev` zodat de commit er niet dubbel in zit.

## S2 · Photos-guard repareren (in `e6788b3`)

`applyTombstone()` in `src/services/sync/pull.ts` slaat een tombstone over zodra het lokale record `_pendingSync` is. Dat vangnet is **een no-op voor foto's**: de foto-uploadwachtrij draait op `_pendingUpload` (zie `src/services/db/photos.ts`, selectie op `_pendingUpload === true`), en `push.ts` zet nergens `_pendingSync` op foto's. Een nog niet geüploade foto met een lokale blob wordt dus alsnog gewist — precies het geval waarvoor het vangnet bedoeld is.

Doe twee dingen:

1. Laat de guard voor `db.photos` op `_pendingUpload` controleren (of sluit foto's expliciet uit mét toelichting waarom).
2. Typeer de tabel-parameter strakker. De huidige vorm `{ _pendingSync?: boolean }` liet deze mismatch type-technisch passeren; een generic over de rij-typen had het als compileerfout gevangen.

Voeg een test toe voor het fotogeval in `src/services/sync/__tests__/pull-tombstone-pending.test.ts`.

> Ter info: de server stuurt op dit moment helemaal geen `deletedIds.photos` (zie `sync.service.ts` in de Beheer-repo), terwijl het client-type het als verplicht declareert. Het pad is dus dormant — repareer het toch, want de mismatch is misleidend en het type belooft iets anders.

## S3 · Service-worker: twee cosmetische aanvullingen

De SW-wijziging zelf is goed: `NEVER_CACHE_API_PATTERN` sluit `/auth` en `/sync` uit, de `NetworkOnly`-route staat vóór de generieke `NetworkFirst`, de woordgrens houdt `/authors` en `/synchronize` buiten schot, en referentiedata blijft offline beschikbaar. Twee kleine dingen:

1. Voeg `src/services/sw/apiCachePatterns.ts` toe aan de `include` van `tsconfig.node.json`. `vite.config.ts` importeert er nu uit `src/`, en dat project is `composite: true` — zodra iemand `tsc -b` draait geeft dat TS6307. Het `typecheck`-script raakt `vite.config.ts` niet, dus dit is latent.
2. Zet een comment bij de test: Workbox matcht een RegExp bij een **cross-origin** URL alleen als de match op index 0 begint. Bij een absolute `VITE_API_URL` (`https://beheer.…/api/v1`) matcht dit patroon pas rond index 28 en wordt de route dus overgeslagen. De test assert de regex, niet de Workbox-routematch — zonder comment geeft dat valse zekerheid.

## S4 · Restrisico vastleggen (niet bouwen)

De tombstone-fix lost echt dataverlies op: op de huidige `dev` zet een server-tombstone `_deleted: true` op een record dat nog `_pendingSync` is, waarna de push het als `delete` aanbiedt en het offline werk van de inspecteur stil verdwijnt. Dát wegen we zwaarder dan het restpunt hieronder, dus de fix gaat mee.

Maar hij is niet af, en dat moet vastgelegd worden in `~/VIBE/InspeXi-Beheer/docs/herstelplan/voortgang/restrisico.md`:

- **Overgeslagen tombstones worden nooit opnieuw aangeboden.** De server levert ze incrementeel (`deletedAt: { gt: since }`) en de PWA schuift de cursor onvoorwaardelijk door. Een overgeslagen tombstone is daarmee voorgoed weg. Het record blijft lokaal bestaan terwijl het in Beheer verwijderd is; de eerstvolgende push geeft een conflict, maar géén van beide resoluties verwijdert het lokaal (`conflicts.ts` zet bij "server" expliciet `_deleted: false`). Herstel kan alleen via een handmatige `initialSync()`, en dat vervalt na `TOMBSTONE_RETENTION_DAYS = 90`. **Oplossing voor later: een deferred-tombstone-store die overgeslagen ids bewaart en bij elke pull opnieuw probeert tot `_pendingSync` weg is.**
- **Chat-tombstones missen hetzelfde vangnet** — `markChatMessageDeleted()` wordt onvoorwaardelijk toegepast, terwijl chatberichten wél gepusht worden.
- **De conflict-UI is niet delete-bewust**: de inspecteur ziet een gewoon veldconflict zonder hint dat het record op de server verwijderd is.

## Mergen

Na S1–S4:

```bash
pnpm install && pnpm build
pnpm test                    # Vitest, incl. de nieuwe tombstone- en SW-tests
pnpm typecheck               # schoon
git checkout dev && git merge --no-ff fix/pwa-branch-salvage-sync-vangnet
git push origin dev
git push origin --delete fix/pwa-branch-salvage-sync-vangnet
```

## Rapporteer terug

Of `dev` inderdaad rood stond en nu groen is, wat de photos-guard opleverde (was het echt een no-op?), of de suites groen zijn, en welke restpunten je hebt vastgelegd.
