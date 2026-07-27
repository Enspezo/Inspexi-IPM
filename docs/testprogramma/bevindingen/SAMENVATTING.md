# Samenvatting — autonoom testprogramma InspeXi

Uitgevoerd op **27 juli 2026** tegen een volledig lokaal draaiende stack. Alle resultaten komen uit
daadwerkelijk uitgevoerde acties in de browser of via HTTP; er is niets afgeleid uit alleen codelezen.

## Uitvoeringscontext

| | |
|---|---|
| Beheer-worktree | `InspeXi-Beheer-test` — branch `test/smoke-programma`, basis `dev` @ ba7d9bb |
| PWA-worktree | `Inspexi-App-test` — branch `test/smoke-programma`, basis `origin/dev` @ bdc77eb (v3-AssetNode-contract) |
| Stack | API :3001, portal :5173, client-portal :5174, PWA :5176, PostgreSQL :5433 |
| Seed | hoofdseed (`SEED_DEMO=1`) + aanvullend `apps/api/prisma/seed-testprogramma.ts` (idempotent, additief) |
| Throttling | uit (`NODE_ENV=test`) tijdens fase 2a/2b; **aan** tijdens fase 2c |

## Tellingen

**260 testgevallen uitgevoerd** (de ~197 uit de scripts plus sub-gevallen en verkennende uitstapjes).

| Actor / suite | PASS | FAIL | BLOCKED | SKIP | Totaal |
|---|---|---|---|---|---|
| SEC-01..09 (rol-autorisatie, cross-tenant) | 56 | 9 | 0 | 1 | 66 |
| SEC-10..18 (client-realm, sync, herstel, sessies) | 7 | 2 | 0 | 0 | 9 |
| INS (inspecteur / PWA) | 25 | 17 | 0 | 2 | 44 |
| BO (backoffice) | 43 | 10 | 0 | 0 | 53 |
| KL (klantportaal) | 18 | 9 | 0 | 0 | 27 |
| PUB (publieke/anonieme flows) | 15 | 0 | 0 | 1 | 16 |
| SU (superuser) | 15 | 3 | 0 | 0 | 18 |
| OA (org-admin) | 18 | 3 | 0 | 1 | 22 |
| Throttling (fase 2c) | 5 | 0 | 0 | 0 | 5 |
| **Totaal** | **202** | **53** | **0** | **5** | **260** |

### Bevindingen per severity — 75 stuks

| Severity | Aantal | Betekenis |
|---|---|---|
| **S1 Blokkerend** | 5 | B-101, B-102, B-206, B-207, B-401 |
| **S2 Ernstig** | 28 | |
| **S3 Matig** | 37 | |
| **S4 Cosmetisch** | 5 | |

## De vijf blokkerende bevindingen

1. **B-206 — élke constatering uit de PWA bereikt de server nooit.** `CreateFindingSheet` zet
   `visualInspectionId` op de `checklistItemId`, wat bij `/sync/push` een foreign-key-violation geeft.
   Nul rijen op de server, en het record blijft eindeloos opnieuw proberen. De inspecteur ziet niets:
   de foutbanner wordt binnen dezelfde tick overschreven door de statuspoll (**B-211**). Dit is precies
   het scenario waar het risicogebied R4 voor gevreesd werd: dataverlies bij de inspecteur in het veld.
2. **B-207 — élk meetstaat-record strandt op dezelfde manier**: de push mist het verplichte
   `templateVersion`. Ook stil.
3. **B-101 — handtekeningen zijn vervalsbaar.** `POST /generated-documents/:id/sign` staat open voor
   álle stafrollen en valideert `signerRoleCode` niet. Een INSPECTEUR ondertekende met HTTP 201 namens
   `CLIENT` (de opdrachtgever), namens `REVIEWER` (de vier-ogen-rol) en zelfs met de niet-bestaande code
   `BESTAAT-NIET`; `signerName` is vrij invulbaar.
4. **B-102 — een INSPECTEUR kan een ondertekend document hard verwijderen.** `DELETE` is ALL_STAFF en
   verwijdert echt (geen soft-delete); de handtekeningen cascaderen mee. Alleen `FINALIZED` is
   beschermd — finaliseren mág de inspecteur niet, weggooien wél.
5. **B-401 — de tab "Constateringen" in het klantportaal crasht** bij elk plan dat constateringen heeft
   (`finding.asset` is niet meegemigreerd naar `assetNode`). Dat is precies de kernfunctie van dat portaal.

Samen met **B-103** en **B-104** (genereren mag ook iedereen; PATCH herschrijft de inhoud van een al
ondertekend document) betekent dit dat één inspecteur de complete documentketen alleen kan doorlopen:
genereren, ondertekenen namens de klant, inhoud achteraf wijzigen, en het bewijs verwijderen.

## Go/no-go per risicogebied

| Risico | Getest via | Oordeel | Onderbouwing |
|---|---|---|---|
| **R1 Isolatie** | SEC-07..13, INS-43/44 | **GO met risico** | Geen enkel datalek: alle cross-tenant reads en mutaties geweigerd, `/sync/pull` bevat uitsluitend eigen org-id's, FK-injectie in 11 varianten geblokkeerd. Wel: existence-oracle op contacts/quotes/users/organizations (403 i.p.v. 404, **B-105**/**B-151**) en de publieke offerte-token is niet aan het subdomein gebonden (**B-152**). |
| **R2 Offerte-lifecycle** | BO-13..33, PUB-01..04 | **NO-GO** | De statusmachine zelf is solide (alle ongeldige overgangen netjes geweigerd), maar: dezelfde persoon kan zijn eigen offerte indienen én goedkeuren (**B-307**), dubbelklik op Versturen stuurt twee klant-e-mails (**B-308**), staffelprijzen worden nooit toegepast (**B-309**), boven de drempel is de offerte via de portal niet indienbaar (**B-304**), en `quantity 999999999` geeft een **HTTP 500** (**B-303**). |
| **R3 Review-gate** | BO-43..46, INS-41 | **GO** | De vier-ogen-gate houdt stand, zowel via de API als via de `/sync`-push: forceren naar `completed`/`approved` zonder review geeft consequent een nette 400. |
| **R4 Sync/offline** | INS-36..42 | **NO-GO** | Twee S1's (**B-206**, **B-207**) zorgen dat constateringen en meetstaten de server nooit bereiken, stil. Daarnaast overschrijft de PWA portalwijzigingen zonder conflictmelding doordat 49 van 52 nodes geen `syncedAt` hebben (**B-209**), en auto-sync bij online-worden vuurt niet (**B-208**). Wat wél goed werkt: de conflictbanner, `/sync/resolve` en de circuit-breaker (exact na 3 cycli). |
| **R5 Autorisatie** | SEC-01..06, BO-08/51 | **NO-GO** | Rolafscherming op CRM, offertes, org-instellingen en de SUPERUSER-registries is volledig dicht (SEC-01/02/03/05 alle PASS). Maar de documentketen staat open voor elke stafrol (**B-101..B-104**) en een SUPERUSER krijgt op elk org-subdomein platform-brede data te zien, met een 500 bij aanmaken (**B-502**/**B-503**). |
| **R6 Validatie** | BO-13..20, INS-12/21..24 | **GO met risico** | Zoals verwacht accepteert de backend negatieve prijzen, korting >100% en btw 250% zonder klacht — bewust gedocumenteerd, geen schade. Numerieke clamping in de meetstaat werkt correct, `NaN`/`Infinity` worden genegeerd. Eén echte fout: overflow op `numeric(12,2)` geeft een 500 (**B-303**). |
| **R7 Online herstel** | PUB-07..16 | **GO** | Het sterkste onderdeel. First-wins is waterdicht (5 gelijktijdige claims → exact 1× REPORTED, 4× CONFLICT met 409), de anti-enumeratie geeft bij 10 verschillende faalvarianten een **byte-identieke** melding, postcodenormalisatie werkt, en `HERINSPECTIE_VOORSTEL` vuurde precies één keer. Enige smet: 500 bij een ontbrekend opslagbestand (**B-154**). |
| **R8 Documenten/tekenen** | BO-47..50, KL-16..20, PUB-05/06 | **NO-GO** | Genereren, PDF- en Word-export werken en escapen injectiedata correct — óók in de PDF. Maar de handtekeningintegriteit is niet gewaarborgd: **B-101** (vervalsbare rol), **B-104** (inhoud wijzigbaar ná ondertekening), **B-404** (client-route valideert de data-URI niet), **B-408** (publieke ondertekening legt geen IP vast). |
| **R9 Planning/beschikbaarheid** | BO-34..40 | **GO met risico** | De PRD-12-logica klopt exact: 409 met `warnings`, override via `overrideAvailabilityWarnings`, en een `AVAILABILITY_OVERRIDE`-regel in de historie. Freelancers zijn terecht standaard onbeschikbaar. Wel: meerdaagse sessies zijn in de UI niet aan een inspecteur toe te wijzen (**B-310**) en interne notities lekken naar de publieke afspraakpagina (**B-306**). |
| **R10 Onboarding** | SU-01..12, OA-09..17 | **NO-GO** | Een nieuw aangemaakte organisatie kan geen eerste gebruiker krijgen (**B-504**) — de onboarding loopt na stap 1 dood. Daarnaast een stored XSS via een SVG-logo dat als `image/svg+xml` wordt teruggeserveerd (**B-507**), en elk instellingen-tabblad PATCHt de hele organisatie waardoor een lege goedkeuringsdrempel stil `0` wordt (**B-508**). Uitnodigingen zelf werken wél correct, inclusief eenmalig gebruik en verlooptermijn. |
| **R11 Notificaties** | BO-10/32/44, INS-35 | **GO met risico** | Notificaties bij offerte-, planning- en inspectiegebeurtenissen werken. Maar klantberichten en klantverzoeken komen nergens aan: geen staf-endpoint, geen staf-UI, geen notificatie — terwijl de klant "wordt in behandeling genomen" te zien krijgt (**B-402**, **B-403**). |

**Samengevat: 5 van de 11 risicogebieden zijn NO-GO** (R2, R4, R5, R8, R10), 4 zijn GO met risico
(R1, R6, R9, R11) en 2 zijn onvoorwaardelijk GO (R3, R7).

## Wat opvalt aan het geheel

De **backend-businesslogica is over het algemeen sterk**: statusmachines, tenantisolatie, FK-validatie,
de vier-ogen-gate, first-wins-claims en de beschikbaarheidsresolutie doen allemaal precies wat het
ontwerp belooft, inclusief nette Nederlandse foutmeldingen. De problemen zitten vrijwel allemaal in drie
andere lagen:

1. **Rolafscherming rond documenten** — één module (`generated-documents`) gebruikt `ALL_STAFF` waar de
   rest van het systeem fijnmazige rolsets hanteert. Dat is de bron van vier van de zwaarste bevindingen.
2. **De PWA-sync-mapper** — twee veldfouten (een verkeerd id, een ontbrekend verplicht veld) maken de
   kernfunctie van de app onbruikbaar, en de foutafhandeling verbergt het.
3. **Portal ↔ API-contractdrift** — de portal vraagt `limit=200` waar de API `@Max(100)` afdwingt
   (**B-305**, raakt 25+ schermen), en het klantportaal gebruikt nog `finding.asset` na de AssetNode-migratie
   (**B-401**). Beide zijn migratie-restanten die met typegeneratie of een integratietest gevangen waren.

Een terugkerend, kleiner thema: overal waar een guard de standaard Nest-exception laat vallen, verdwijnt
de Nederlandse taallaag (**B-106**, **B-155**, **B-601**).

## Niet getest — met reden

| Onderwerp | Reden |
|---|---|
| AI-voorcontrole (PRD-13), inhoudelijk | Geen `ANTHROPIC_API_KEY`; `GET /ai-review/status` geeft `available:false`. De toggle en de UI zijn wél getest (OA-08). |
| Voice-invoer | Zelfde ontbrekende sleutel; daarnaast ontbreekt `SpeechRecognition` in een geautomatiseerde browser. Het *graceful* gedrag is wél geverifieerd (INS-27: de mic-knop verdwijnt, typen blijft werken). |
| E-mail-aflevering | Buiten scope (masterplan §1) — we hebben alleen gecontroleerd dát verzending getriggerd wordt. |
| B-219 (offline reload) | Gemeten op de dev-server; de workbox-configuratie suggereert dat een productiebuild dit oplost. **Moet hertest worden op een echte build** — blijft het bestaan, dan is het S1. |

## Bestanden

- `logboek.md` — setup en omgevingsverificatie
- `logboek-SEC-A.md`, `logboek-SEC-B.md`, `logboek-INS.md`, `logboek-BO.md`, `logboek-KL-PUB.md`, `logboek-SU-OA.md`, `logboek-THROTTLE.md` — regel per testgeval
- `B-001.md` t/m `B-601.md` — 75 bevindingen volgens het sjabloon
- `img/` — 40+ screenshots als bewijs
- `lib/` — herbruikbare test-harness, fixture-id's en het PWA-draaiboek

### Nummerreeksen (om botsingen tussen parallelle testers te voorkomen)

| Reeks | Suite |
|---|---|
| B-001 | Setup/verkennend (hoofdagent) |
| B-101..B-107 | SEC-01..09 |
| B-151..B-155 | SEC-10..18 |
| B-201..B-223 | INS (PWA) |
| B-301..B-315 | BO |
| B-401..B-412 | KL/PUB |
| B-501..B-511 | SU/OA |
| B-601 | Throttling |

## Aanbevolen volgorde van oplossen

1. **B-206 + B-207** — zonder deze twee is de PWA in productie onbruikbaar; het zijn beide een
   eenregelige veldfout in de push-mapper. Direct daarna **B-211**, zodat een mislukte sync niet meer stil is.
2. **B-101 t/m B-104** — beperk `generated-documents` tot de juiste rolsets en valideer `signerRoleCode`
   tegen `imp_signer_roles`; maak DELETE een soft-delete en blokkeer PATCH na ondertekening.
3. **B-401** — `finding.asset` → `assetNode` in het klantportaal; dit is een crash op de hoofdfunctie.
4. **B-504** — onboarding kan nu niet afgemaakt worden.
5. **B-507** — stored XSS via SVG-logo (serveer als `application/octet-stream` of saneer de SVG).
6. **B-305** — één contractfout die 25+ schermen tegelijk repareert.
