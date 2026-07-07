# Refactor-prompts voor Claude Code — juli 2026

> Gebaseerd op `docs/REVIEW-2026-07-AANBEVELINGEN.md`. Elke prompt is zelfstandig en copy-paste-klaar.
> **Parallel draaien:** Lane A, B en C raken verschillende code en kunnen tegelijk (aparte branches / aparte Claude Code-sessies, evt. git worktrees). Binnen een lane: volgorde aanhouden.

| Lane | Repo | Prompts | Parallel met |
|---|---|---|---|
| A — Backend | InspeXi-Beheer | 1 → 2 | B, C |
| B — Frontend | InspeXi-Beheer | 3 → 4 | A, C |
| C — PWA | Inspexi-App | 5 | A, B |
| D — Afsluiter | InspeXi-Beheer | 6 (pas ná merge van 1+2) | — |

Prompt 1 en 2 kunnen desnoods óók parallel (verschillende modules), maar draai ze bij twijfel na elkaar op dezelfde branch-basis.

---

## Prompt 1 — Chat-module opsplitsen (Lane A)

```
Lees eerst CLAUDE.md en docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie A5, punt 16).

Opdracht: refactor apps/api/src/modules/chat/chat.service.ts (1449 regels) naar sub-services, exact volgens het bestaande patroon van de quotes- en planning-modules (zie CLAUDE.md "Grote modules zijn opgesplitst in per-resource/per-domein services"): sub-services injecteren de core-service, nooit andersom; de controller delegeert; alles geregistreerd in chat.module.ts.

Werkwijze:
1. Maak branch refactor/split-chat-service.
2. Verken eerst met een Explore-subagent: breng alle publieke methods van ChatService in kaart, wie ze aanroept (controller, andere modules, gateway?), en cluster ze in logische domeinen. Verwacht ongeveer: ChatThreadsService (threads/messages CRUD + queries), ChatPresenceService (aanwezigheid), ChatTranscriptsService (transcripten/notes), en ChatService als core (gedeelde org-scoped checks). Wijk af als de code een betere indeling suggereert — rapporteer je gekozen indeling voordat je gaat schrijven.
3. Pure verplaatsing: GEEN gedragswijzigingen, geen API-contractwijzigingen, geen DTO-wijzigingen. DI-vrije helpers naar chat.helpers.ts (zoals quotes.helpers.ts).
4. Verplaats bijbehorende tests mee naar per-service .spec.ts-bestanden; vul aan waar een sub-service publieke methods zonder test heeft.
5. Geen enkel bestand in de module mag na afloop groter zijn dan ~500 regels.

Verificatie (verplicht, gebruik een subagent voor de review):
- cd apps/api && pnpm test — alles groen
- npx turbo run build vanuit de root — groen
- Laat een code-review-subagent de diff controleren op: gedragswijzigingen (mogen er niet zijn), dependency-richting (sub → core), en of alle controller-endpoints nog dezelfde service-methods bereiken.

Commit in het Engels: "refactor: split chat service into thread/presence/transcript sub-services", Co-Authored-By Claude. Niet pushen/mergen; laat de branch staan voor review.
```

---

## Prompt 2 — Generated-documents opsplitsen + JSON-validatie (Lane A, ná prompt 1 of parallel op eigen branch)

```
Lees eerst CLAUDE.md en docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie A5, punten 17 en 21).

Opdracht, branch refactor/split-generated-documents, twee delen:

DEEL 1 — apps/api/src/modules/generated-documents/generated-documents.service.ts (896 regels) opsplitsen volgens het quotes/planning-subservice-patroon uit CLAUDE.md:
- GenerationContextService: alle query-/context-opbouw, inclusief het diep-geneste PLAN_INCLUDE. Maak de includes selectief per documenttype: een documenttype dat geen findings/measurements rendert mag ze ook niet ophalen. Verken eerst met een Explore-subagent welke template-blokken welke data gebruiken voordat je includes versmalt — bij twijfel: include behouden (correctheid boven optimalisatie).
- GeneratedDocumentsService (core): CRUD, status, org-scoped checks.
- DocumentSigningService: ondertekenflow (tokens, TTL, status).
- PDF-/Word-rendering blijft in de bestaande document-generation module; alleen orchestratie hier.
Pure verplaatsing waar mogelijk; de enige toegestane gedragswijziging is het versmallen van includes, en die moet je expliciet per documenttype verantwoorden in de PR-beschrijving.

DEEL 2 — Zod-validatie voor JSON-kolommen in de service-laag:
- Inventariseer met een Explore-subagent alle schrijfpaden naar de Prisma JSON-kolommen (o.a. AssetNode.technicalData, InspectionPlan.metadata, VisualInspection.checklistResults) — vergeet de /sync-push niet.
- Definieer per kolom een Zod-schema in een colocated schemas-bestand per module; valideer vóór elke create/update; bij falen een 400 met Nederlandse melding (consistent met bestaande ValidationPipe-stijl).
- Schema's moeten de BESTAANDE data accepteren: schrijf ze permissief (passthrough voor onbekende keys) op basis van wat er nu daadwerkelijk in de seed en de services wordt geschreven. Doel is garbage tegenhouden, niet bestaande flows breken.

Verificatie:
- cd apps/api && pnpm test && pnpm test:e2e (E2E vereist draaiende Postgres: docker compose up -d, en let op: nooit twee E2E-runs tegelijk)
- npx turbo run build vanuit de root
- Review-subagent op de diff: geen contractwijzigingen behalve de gedocumenteerde include-versmalling en nieuwe 400's op garbage-input.

Commits in het Engels (twee losse commits voor deel 1 en 2), Co-Authored-By Claude. Branch laten staan voor review.
```

---

## Prompt 3 — Gedeeld frontend-package (Lane B)

```
Lees eerst CLAUDE.md en docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie B, punten 22 en 26).

Opdracht, branch refactor/shared-frontend-package: hef de duplicatie tussen apps/portal en apps/client-portal op via een nieuw workspace-package packages/shared-web.

1. Verken eerst met een Explore-subagent de exacte verschillen tussen de duplicaten:
   - lib/api-client.ts (portal 175 regels vs client-portal 144 — let op: divergente 401/refresh-afhandeling, dit is de riskantste stap)
   - lib/format.ts, lib/status.ts, download-util
   Rapporteer per bestand: identiek / triviaal verschillend / wezenlijk verschillend, voordat je bouwt.
2. Maak packages/shared-web (TypeScript, geen build-stap nodig — direct source-import zoals gebruikelijk in pnpm workspaces met Vite):
   - api-client-core: gedeelde fetch/unwrap/upload-logica, met injecteerbare hooks voor token-opslag en 401-afhandeling zodat portal (isInitializing-vlag) en client-portal (refreshPromise + clearTokens CustomEvent) hun eigen gedrag behouden. GEEN gedragswijziging in de auth-flows — dat is het acceptatiecriterium.
   - format.ts: formatDate/formatShortDate/formatDateTime/formatCurrency/formatFileSize (superset van beide).
   - status.ts: gedeelde maps (o.a. GENERATED_DOCUMENT_STATUS, SIGNATURE_STATUS) + getStatusConfig/StatusBadge-typen. Portal-specifieke maps (TASK_STATUS, PLANNING_STATUS etc.) blijven in de portal.
   - download-file util.
3. Migreer beide apps naar het package; verwijder de duplicaten; laat per app een dun lib/-bestand staan dat re-exporteert (zodat bestaande imports @/lib/format blijven werken en de diff klein blijft).
4. Types: verplaats ALLEEN de aantoonbaar gedeelde interfaces (verken met subagent welke types in beide apps voorkomen) naar packages/shared-web/types; splits de rest van types/index.ts per app op in domein-bestanden met re-export via index.ts. Geen renames.
5. Werk pnpm-workspace.yaml/turbo.json/tsconfig-paths bij zoals nodig.

Verificatie:
- npx turbo run build vanuit de root — groen (beide apps + package)
- cd apps/portal && pnpm test — groen
- Handmatige smoke-check via een subagent die de diff reviewt op: identieke runtime-semantiek van beide api-clients (met name 401-refresh-race), en geen circular imports.

Commit Engels: "refactor: extract shared-web package for api-client core, format, status and download utils", Co-Authored-By Claude. Branch laten staan voor review.
```

---

## Prompt 4 — Query-keys, mutatie-toasts & bundle-splitting (Lane B, ná prompt 3)

```
Lees eerst CLAUDE.md en docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie B, punten 23–25, 28). Basis: de gemergde branch van prompt 3 (refactor/shared-frontend-package). Branch: refactor/query-keys-and-ux-hygiene.

DEEL 1 — Query-key-factory (portal + client-portal):
- Maak per app een lib/query-keys.ts met key-factories per domein (patroon: all/lists/list(params)/detail(id) als const-arrays).
- Migreer met subagents ALLE hooks in pages/*/hooks/ (portal heeft er ~77) naar de factories: verdeel het werk over parallelle subagents per pagina-domein (contacts, quotes, requests, tasks, inspecties, ...), elk met dezelfde instructie en het factory-patroon als voorbeeld.
- Invalidaties gaan altijd via de factory (invalidateQueries({ queryKey: xKeys.lists() }) of xKeys.all()); geen losse string-arrays meer. Gedrag moet gelijk blijven of strikt beter (meer correcte invalidatie is OK, minder niet).

DEEL 2 — Standaard mutatie-foutafhandeling:
- Breid de gedeelde use-api-mutation hook uit met een default onError die via useToast een Nederlandse melding toont (getErrorMessage met NL-fallback "Er is iets misgegaan"). Per-mutation onError blijft overridebaar en default-gedrag mag geen dubbele toasts veroorzaken waar al een onError bestaat — inventariseer die gevallen eerst.
- Verwijder daarna lokale ad-hoc error-toasts die dubbel worden.

DEEL 3 — Bundle-hygiëne (alleen portal):
- vite.config.ts: manualChunks voor docx-preview, xlsx, konva(+react-konva).
- Zoek top-level imports van deze libs in pagina's/components en maak ze lazy (React.lazy + Suspense) waar ze in een tab of modal leven; het floor-plan-tab is al lazy — gebruik dat als referentie.
- Voeg rollup-plugin-visualizer toe (alleen bij ANALYZE=1) en rapporteer de chunk-groottes vóór/ná in je eindrapport.
- Zet een error-boundary rond de docx-preview-renderer zodat een corrupt bestand geen paginacrash geeft (NL-foutmelding in een ErrorBox).

Verificatie:
- npx turbo run build — groen; cd apps/portal && pnpm test — groen
- Review-subagent: steekproef van 10 gemigreerde hooks op correcte key-hiërarchie + invalidatie; check dat geen enkele mutation zonder foutfeedback achterblijft.

Twee of drie commits (per deel), Engels, Co-Authored-By Claude. Branch laten staan voor review.
```

---

## Prompt 5 — PWA-repo opschonen + db/sync opsplitsen (Lane C, repo Inspexi-App)

```
Lees eerst CLAUDE.md van deze repo én ../InspeXi-Beheer/docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie C, punten 29, 30, 33, 36). Context: deze repo is nu alleen nog de bron van apps/inspectie-app (de PWA); apps/api, apps/portal en apps/client-portal zijn vervangen door de InspeXi-Beheer-repo. De aankomende v3-sync-cutover (AssetNode-boom) maakt een opgeruimde, modulaire sync-laag noodzakelijk. Huidige branch-basis: feat/pwa-conflict-resolution.

DEEL 1 — Repo-opschoning, branch chore/prune-legacy-apps:
- Verifieer eerst met een Explore-subagent dat apps/inspectie-app NIETS runtime-matig importeert uit apps/api, apps/portal of apps/client-portal (packages/shared mag wél; check ook vite/tsconfig/turbo-referenties en test-setup).
- Tag de huidige staat (legacy-monorepo-final) zodat niets verloren gaat, verwijder daarna de drie legacy-apps, en schoon pnpm-workspace.yaml, turbo.json, root-package.json-scripts, docker-compose.yml en de root-docs (README/CLAUDE.md) op zodat ze de nieuwe realiteit beschrijven: PWA-only repo die tegen de InspeXi-Beheer-backend praat.
- pnpm install && pnpm build && pnpm test moeten groen zijn na de opschoning.

DEEL 2 — db-laag opsplitsen, branch refactor/split-db-and-sync (gebaseerd op deel 1):
- apps/inspectie-app/src/services/db/index.ts is 4672 regels. Splits per domein: schema/versies+migraties in een eigen bestand (dexie-schema.ts met de volledige versiegeschiedenis — migraties NIET herschrijven of samenvoegen, Dexie heeft het volledige upgrade-pad nodig), en per-domein table-helpers (inspection-plans, asset-nodes/assets, findings, measurement-sheets, photos, chat, lookups). index.ts blijft bestaan als barrel + Dexie-class zodat alle bestaande imports blijven werken.
- Vang db.open()-fouten centraal af: één herstel-scherm (NL) i.p.v. witte pagina, met optie "opnieuw proberen" en duidelijke waarschuwing dat data wissen dataverlies betekent.

DEEL 3 — syncService opsplitsen (zelfde branch):
- apps/inspectie-app/src/services/syncService.ts is 2156 regels. Splits in: sync/pull.ts, sync/push.ts, sync/conflicts.ts, sync/queue.ts (retry/backoff-meta) en sync/index.ts als orchestrator met de bestaande publieke API (geen aanroepwijzigingen elders).
- Pure verplaatsing, met ÉÉN toegestane gedragsverbetering: een globale conflict-circuit-breaker naast de bestaande per-record-bescherming — als dezelfde sync-cyclus meer dan N (configureerbaar, default 3) keer achtereen door conflicts opnieuw triggert, pauzeer sync en toon de bestaande ConflictBanner met een "sync gepauzeerd"-status. Schrijf hier unit-tests voor.
- Dit is bewust prep-werk voor de v3-cutover: houd de v2-contractlogica intact en markeer de plekken die bij v3 gaan wijzigen met // TODO(v3-cutover): ... comments, zodat de cutover-branch straks chirurgisch kan zijn.

Verificatie per deel: pnpm build + pnpm test groen; review-subagent op de diff (geen gedragswijzigingen behalve de circuit-breaker en het herstel-scherm; Dexie-versiegeschiedenis ongewijzigd).

Commits Engels, per deel, Co-Authored-By Claude. Branches laten staan voor review.
```

---

## Prompt 6 — Soft-delete-standaardisatie (Lane D — pas ná merge van prompt 1+2, apart draaien)

```
Lees eerst CLAUDE.md en docs/REVIEW-2026-07-AANBEVELINGEN.md (sectie A5, punt 20). Dit is de riskantste refactor uit de reeks: doe hem alleen, klein en controleerbaar.

Opdracht, branch refactor/soft-delete-standardization — FASE 1 (alleen analyse + fundament, GEEN grootschalige migratie):
1. Inventariseer met Explore-subagents alle modellen in apps/api/prisma/schema.prisma op hun soft-delete-mechanisme: isDeleted / deletedAt / beide / geen. Lever een tabel op in docs/SOFT-DELETE-INVENTORY.md met per model: mechanisme, welke services erop filteren, en of het model in het /sync-contract zit.
2. Vind met een tweede subagent alle query-plekken waar een soft-delete-filter ONTBREEKT terwijl het model er wel een heeft (het bekendste risico: relaties die verwijderde records tonen via include/joins). Lever de lijst met bestand+regel in hetzelfde document, gesorteerd op risico.
3. Fix ALLEEN de gevonden ontbrekende filters (gedragsfix, klein en per stuk te reviewen) — geen schema-wijzigingen in deze fase.
4. Voeg een tombstone-opruimjob toe voor sync-entiteiten: een idempotent script (apps/api/scripts of een @nestjs/schedule cron, kies wat past bij de bestaande conventies) dat records met deletedAt ouder dan 90 dagen hard verwijdert, in de juiste FK-volgorde (zie de seed-opruimvolgorde in CLAUDE.md). Unit-test op de volgorde-logica.
5. Sluit af met een concreet migratievoorstel (in hetzelfde document) voor fase 2: isDeleted → deletedAt op de kern-modellen, inclusief migratiestappen, risico's en welke E2E-tests het afdekken. NIET uitvoeren — alleen het voorstel.

Verificatie: pnpm test + pnpm test:e2e + npx turbo run build groen. Review-subagent op elke gedragsfix uit stap 3: bevestig dat het om een échte omissie ging en niet om een bewuste "toon ook verwijderde" plek (admin-/audit-views!).

Commits Engels, Co-Authored-By Claude. Branch laten staan voor review.
```

---

## Prompt 6b — Reparatie tombstone-cron (NO-GO uit review, zelfde branch)

```
Werk verder op branch refactor/soft-delete-standardization. De review keurde commits 07a9a91/5ff63ed/e652e2f goed, maar gaf een NO-GO op de tombstone-cron (3bf3c2c) wegens niet-afgedekte Restrict-FK's. Repareer het volgende in apps/api/src/modules/sync/tombstone-cleanup.service.ts:

1. BLOKKEREND — ontbrekende Restrict-guards (geverifieerd in schema.prisma):
   - assetNode.deleteMany mist `planScopes: { none: {} }` — InspectionPlanLocation.assetNode (schema regel ~2788) heeft geen onDelete en RESTRICT dus. Een getombstonede LOCATION-node die nog in een plan-scope zit geeft nu P2003 en blokkeert de HELE deleteMany.
   - inspectionPlan.deleteMany mist guards voor `reports: { none: {} }` en `generatedDocuments: { none: {} }` — Report.inspectionPlan (~3019) en GeneratedDocument.inspectionPlan (~3616) zijn ook Restrict. Een verlopen plan mét gegenereerd document (het standaardscenario) faalt nu.
   Keuze per geval documenteren: guard (record blijft staan tot de referrer weg is) óf expliciet mee-opruimen; voor plan-scope-rijen van een getombstoned plan is mee-opruimen logisch (Cascade doet dat al bij plan-delete — check), voor Reports/GeneratedDocuments is een guard de veilige keuze.
2. Leid de FK-afhankelijkheden af uit het Prisma-schema (DMMF: Prisma.dmmf.datamodel) in de unit-test i.p.v. de zelf-gedeclareerde TOMBSTONE_FK_DEPENDENCIES-lijst: de test moet falen zodra iemand een nieuwe verplichte relatie zonder onDelete naar een gepurged model toevoegt. Schrijf ook een testcase voor elk van de drie bovenstaande scenario's.
3. handleCron: try/catch per stap met Logger.error (cron mag nooit een unhandled rejection geven) + env-kill-switch TOMBSTONE_CLEANUP_ENABLED (default aan; '0'/'false' = uit) — documenteer in .env.example.
4. Documentatie in docs/SOFT-DELETE-INVENTORY.md §3: (a) resurrect-risico — een PWA-device dat >90 dagen offline was mist de gepurgede tombstone en kan het record via de idempotente create-adoptie in de push weer tot leven wekken; benoem de mitigatie (bij eerste sync na lange offline-periode: volledige re-pull, of purge-horizon koppelen aan een minimum-sync-leeftijd per device); (b) Photo/storage-orfanen: Photo is polymorf (entityType/entityId, geen FK) — purge laat photo-rijen en storage-bestanden achter; benoem als bekend restpunt met follow-up.
5. Klein (zelfde bugklasse als de gefixte counts, mag in deze branch): project-phases.service.ts:41/:61 `_count.inspectionPlans` en document-tags.service.ts:38/:63 `_count.documents` filteren soft-deleted rijen niet mee.

Verificatie: npx tsc --noEmit + npx jest src/modules/sync src/modules/project-phases src/modules/document-tags groen; laat een review-subagent de nieuwe guards tegen het schema controleren. Commit(s) Engels, Co-Authored-By Claude, branch laten staan.
```

---

## Prompt 7 — PWA v3-cutover (repo Inspexi-App, ná prompt 5 — die is gemerged)

```
Opdracht: migreer de PWA naar sync-contract v3 (unified AssetNode-boom). Branch feat/pwa-v3-asset-node, basis dev.

Autoritatieve contract-specificatie: ../InspeXi-Beheer/docs/fase3/PWA-CUTOVER-ASSET-NODE.md — lees dat document VOLLEDIG. Maar let op, het is geschreven vóór de recente refactors; deze afwijkingen gelden:
- Dexie zit inmiddels op v13 (niet v9): de migratie uit §2 wordt dus versie 14, toegevoegd in services/db/dexie-schema.ts (de volledige versiegeschiedenis daar NIET herschrijven — alleen v14 toevoegen).
- De db-laag is gesplitst (services/db/: dexie-schema.ts + per-domein bestanden) en de sync-laag ook (services/sync/: pull.ts, push.ts, conflicts.ts, queue.ts, index.ts). Prompt 5 heeft // TODO(v3-cutover)-markers geplaatst op de plekken die moeten wijzigen — begin met een Explore-subagent die alle markers + de huidige v2-veldmappings inventariseert.
- Controleer eerst tegen welke Beheer-branch je dev-API v3 serveert (in ../InspeXi-Beheer; volgens het cutover-doc feat/unified-asset-node-tree — verifieer of dat inmiddels dev is). Alle round-trip-tests draaien tegen die API.

Implementeer in deze volgorde (elk onderdeel een eigen commit):
1. Types (packages/shared, contract-doc §3): Asset+Location → AssetNode; InspectionPlan.locationId; Finding.assetNodeId+inspectionPlanId; de vier uitvoerings-entiteiten + geneste StandaloneMeasurementValue. Typecheck groen.
2. Dexie v14 (§2, aangepast): assets+locations → één assetNodes-store met de veldhernoemingen (parentAssetId→parentId, assetType/objectType→typeCode, locationDescription→description); findings assetId→assetNodeId. EXTRA t.o.v. het doc (bevinding uit review 6b): normaliseer tijdens de upgrade legacy-rijen met object-vormige checklistResults/measurements naar [] — de server wijst object-vormige arrays sinds de Zod-validatie af. _pendingSync-records migreren mee (pending v2-wijzigingen gaan dus als v3 de deur uit). Migratietest per §2.2, uitgebreid met een _pendingSync- en een checklistResults:{}-fixture.
3. Sync-laag (§4): pull/push op de v3-keys; contractVersion-guard (§6 stap 5): pull met contractVersion !== 3 → sync blokkeren + "app bijwerken nodig"-melding, nooit stil doorsyncen. Push: nooit orgId/path/depth, nooit inspectionPlanId/locationId op een node; syncedAt mee in elke update; standaloneMeasurements met geneste values (replace-on-write, §1.6); assetNodes in ouder-vóór-kind-volgorde en een failed kind = "volgende sync opnieuw", geen harde fout (§1.3).
4. UI (§5): asset/locatie aanmaken op de boom (parentId) i.p.v. aan het plan; plan-formulier zet locationId (hoofdlocatie); nodeNumber read-only tonen waar beschikbaar.
5. Round-trip-verificatie (§6 stap 6 + §7-checklist integraal afwerken): offline locatie+asset+finding+meting → push → pull op tweede device/profiel → boom klopt; delete → tombstone; conflict-pad (bestaande conflicts.ts) blijft werken op de singular v3-entityType-namen (§1.7).

Verificatie: pnpm build + pnpm test groen; alle checklist-items uit contract-doc §7 aantoonbaar afgevinkt in de PR-beschrijving; laat een review-subagent de push-payload-opbouw controleren op de verboden velden en de whitelist van §1.3/§1.5.

Uitrol-notities voor in de PR (niet uitvoeren): Dexie v14 is forward-only (rollback = herinstallatie + IndexedDB wissen, zie §6-rollback); eerst pilotgroep van 1–2 inspecteurs; SW-update-prompt moet actief zijn zodat devices de nieuwe versie daadwerkelijk krijgen. Commits Engels, Co-Authored-By Claude, branch laten staan voor review.
```

**Follow-up ná gevalideerde cutover (Beheer-repo, klein):** compat-wrappers `assets`/`inspection-locations` verwijderen + de v2-restanten in de sync-module opruimen (zie reviewrapport A19). Prompt volgt na de pilot.

---

## Prompt 7b — nodeNumber-branch porten naar de gesplitste structuur (repo Inspexi-App)

```
De branch feat/pwa-v3-asset-node (2 commits: server-assigned nodeNumber read-only + in-memory sort-fix voor cachedAsset/LocationTypes) is inhoudelijk goedgekeurd, maar is gebaseerd op de code van VÓÓR de db/sync-splitsing: hij wijzigt het oude monolithische services/syncService.ts en services/db/index.ts, die op dev zijn vervangen door services/sync/* en per-domein db-modules (syncService.ts is op dev nog maar een 9-regels facade). Rechtstreeks mergen geeft conflicten of resurrect de oude bestanden.

Opdracht: maak een nieuwe branch feat/pwa-v3-node-number op basis van dev en port beide commits handmatig (géén rebase/cherry-pick van de oude branch — de doelbestanden bestaan niet meer):
1. nodeNumber: veld toevoegen aan het AssetNode-type in packages/shared (nodeNumber: string | null, server-owned); persistentie in de assetNodes-store (pull vult hem; geen Dexie-index nodig — geen schema-versie-bump); de assetNodes-push-serializer in services/sync/push.ts mag hem NOOIT meesturen (whitelist, zoals orgId) — neem de bestaande whitelist-comment-stijl over; UI: AssetDetailPage-header + AssetTree tonen het nummer read-only met een "concept"-placeholder zolang nodeNumber null is (offline aangemaakt, nog niet gesynct).
2. Sort-fix: getCachedAssetTypes/getCachedLocationTypes sorteren in-memory op sortOrder i.p.v. .orderBy("sortOrder") (geen index → SchemaError); staat nu in het oude db/index.ts — zoek de huidige locatie van deze functies in de gesplitste db-laag.
3. Tests: port de uitbreidingen van syncService.v3-push.test.ts (geen orgId/path/depth/nodeNumber in enige push-payload; nodeNumber uit pull wordt gepersisteerd) naar de huidige teststructuur.
4. Verwijder daarna de oude branch feat/pwa-v3-asset-node NIET zelf — meld alleen dat hij vervangen is.

Verificatie: pnpm build + pnpm test groen. Commits Engels, Co-Authored-By Claude, branch laten staan voor review.
```

---

## Prompt 8 — Beheer-opruiming: v2-compat verwijderen (repo InspeXi-Beheer, ná de PWA-v3-merge)

```
Lees eerst CLAUDE.md (secties over compat-wrappers en de AssetNode-boom) en docs/fase3/PWA-CUTOVER-ASSET-NODE.md. Context: de PWA is gecutoverd naar sync-contract v3 (assetNodes); de compat-wrappers uit de integratiefase kunnen weg. Branch chore/remove-v2-compat, basis dev.

STAP 1 — Verificatie vóór verwijdering (Explore-subagent, resultaat eerst rapporteren):
- Inventariseer ALLE consumers van de oude endpoints: grep in apps/portal, apps/client-portal, apps/api/test (E2E), scripts en docs naar aanroepen van /assets en /inspection-locations (en de bijbehorende hooks/api-calls in de portal). De staf-portal (inspectie-detail Assets-tab e.d.) kan nog op de compat-endpoints leunen — als dat zo is, migreer die calls in deze branch éérst naar de asset-nodes-endpoints (aparte commit, gedrag gelijk).
- Check dat er geen v2-pad meer in de PWA-repo zit dat deze endpoints aanroept (dev van ../Inspexi-App is v3-only na de cutover-merges — verifieer).

STAP 2 — Verwijderen:
- Modules apps/api/src/modules/assets en apps/api/src/modules/inspection-locations volledig: controller, service, dto's, module-registratie in app.module.ts, bijbehorende unit-tests, en hun vermelding in eventuele E2E-suites (E2E-tests die de compat-endpoints testen: verwijderen of ombouwen naar /asset-nodes — kies ombouwen als ze unieke scenario's dekken).
- V2-restanten in de sync-module: zoek in apps/api/src/modules/sync naar dode v2-mapping-code, 'assets'-keys, oude contract-versie-constanten of compat-branches en ruim ze op. Let op: NIETS verwijderen wat het v3-contract zelf gebruikt; bij twijfel laten staan en rapporteren.
- Documentatie bijwerken: CLAUDE.md (compat-wrapper-vermeldingen + "tot de PWA-cutover"-passages), docs/fase3/PWA-CUTOVER-ASSET-NODE.md status-kop ("cutover afgerond, wrappers verwijderd per <datum>").

STAP 3 — Verificatie:
- cd apps/api && pnpm test && pnpm test:e2e (docker compose up -d eerst; nooit twee E2E-runs tegelijk) — alles groen.
- npx turbo run build vanuit de root — groen.
- Review-subagent op de diff: geen enkele overgebleven referentie naar de verwijderde modules (imports, module-registraties, Swagger-tags, sidebar/portal-calls), en de sync-module onaangetast qua v3-gedrag.

Deploy-notitie voor in de PR (niet uitvoeren): pas uitrollen nadat alle veld-devices aantoonbaar op de v3-PWA-build zitten (SW-update bevestigd bij de pilotgroep) — een achtergebleven v2-device krijgt vanaf dan 404's op zijn REST-calls. Commits Engels, Co-Authored-By Claude, branch laten staan voor review.
```

---

## Werkwijze & review

1. Start Lane A, B en C gerust tegelijk in drie Claude Code-sessies (of worktrees). Binnen een lane: wachten op de vorige prompt.
2. Elke prompt eindigt met een branch die blijft staan — merge niks zelf.
3. Plak na afloop hier de branchnamen; dan review ik de diffs per branch en geef ik go/no-go + eventuele fixes vóór merge.
4. Ná het mergen van alle branches is de codebase klaar voor de feature-fase (E46–E51 uit het reviewrapport) en de v3-cutover van de PWA.
