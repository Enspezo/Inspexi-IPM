# Openstaande beslispunten & backlog-epics

De vier hoofdkeuzes zijn genomen (zie `00-herstelplan.md` §2). Hieronder staat wat er **nog** een antwoord van de eigenaar nodig heeft, plus de drie features die bewust buiten het herstelplan vallen.

---

## A. Beslispunten die een werkpakket blokkeren

| # | Vraag | Blokkeert | Opties | Advies |
|---|---|---|---|---|
| **A1** | **Versie-anker voor sync-conflicten.** `syncedAt` is geen betrouwbaar anker (49/52 nodes NULL). Overstappen op `updatedAt` als universeel anker, of fail-closed bij een ontbrekende `syncedAt`? | WP-D1 | (a) `updatedAt` als anker — contractwijziging + bump + Dexie-veld + migratie; (b) fail-closed — geen contractwijziging, maar een tijdelijke conflictgolf op 49 nodes | (a): elk record heeft `updatedAt` altijd; (b) verplaatst het probleem naar de gebruiker. **→ Besloten 28-07-2026: optie (a), `updatedAt` als anker** (uitvoering in WP-D1) |
| **A2** | **Canonieke `MeasurementSheetRecord.data`-vorm.** Server schrijft `{isolation:{…}}`, PWA `{sections:{isolation:{…}}}`. | WP-D2 | Kies één vorm; de andere kant migreert | Server-vorm als canoniek (portal + REST + seeds hangen eraan); PWA past zich aan + Dexie-migratie. **→ Besloten 28-07-2026: servervorm canoniek** (uitvoering in WP-D2) |
| **A3** | **Ziet de inspecteur alle org-plannen of alleen zijn eigen?** De pull filtert nu niet op `assignedTo`; het dashboard labelt 9 plannen als "Toegewezen", waarvan 3 met `assignedTo: null`. | WP-C3 (B-223a) | (a) alleen eigen plannen — pull-scope versmallen (gedragswijziging over beide repo's); (b) alle org-plannen — alleen het label corrigeren | (b) tenzij er een privacyreden is; veldwerk vraagt vaak om overnemen van collega's |
| **A4** | **Anonimisering van de hersteller.** Bij de constatering wordt de naam weggelaten, in de herstelverklaring één tab verderop staat hij er wél. | WP-C2 (B-409) | (a) anonimiteit leidend — tweede, geanonimiseerde documentrendering incl. PDF (0,5–1 dag); (b) verklaring leidend — toon ook bij de constatering dát er een ondertekende verklaring is (< 1 uur) | (b), tenzij een AVG-analyse anders uitwijst. Een verklaring hóórt een ondertekenaar te benoemen |
| **A5** | **Offline inloggen ná uitloggen.** `logout()` wist de sessie, dus de "eerdere sessie"-route is structureel onbereikbaar. | WP-D3 (B-220) | (a) mag niet — melding actiegerichter maken + waarschuwen bij uitloggen met pending changes; (b) mag wel — e-mail + gehashte pincode bewaren zonder token (securityreview nodig) | (a), en pas het testscript INS-38 aan. Veldrealiteit kan (b) afdwingen |
| **A6** | **`reviewerId` via `/sync/push`.** Uit de whitelist halen is een contractversmalling. | WP-C3 (B-217) | (a) verwijderen — check eerst of de PWA het meestuurt; (b) rol-guarden + weigeren bij `reviewerId === user.id` | (a) als de PWA het niet gebruikt; planningsvelden horen via de portal. **→ Afgehandeld in WP-C3 (PR #150): optie (b), rol-guard** — de PWA bleek de velden mee te sturen |

---

## B. Beslispunten zonder blokkade (kunnen later)

| # | Vraag | Context | Advies |
|---|---|---|---|
| **B1** | **Is de organisatie-slug muteerbaar?** De API ondersteunt het volledig en correct (duplicaatcheck, cache-invalidatie op oude én nieuwe slug); de UI ontkent het. | B-511 §2, herstelpad voor B-505 | Maak het zichtbaar voor SUPERUSER mét waarschuwing over bookmarks en verstuurde links — dat is meteen het herstelpad voor een verkeerd gekozen slug |
| **B2** | **E-mailadressen zijn globaal uniek.** Een ORG_ADMIN kan daardoor vaststellen dat een adres elders op het platform bestaat. | B-511 §8, familie van B-105 | Accepteren en documenteren. E-mail per org uniek maken is een ingrijpende migratie met gevolgen voor login |
| **B3** | **Optimistic locking op de organisatie?** De per-tab-PATCH lost het meeste op, maar twee beheerders op hetzelfde tabblad overschrijven elkaar nog. | B-508 deel 3 | Alleen doen als gelijktijdig beheer realistisch is |
| **B4** | **Enumeratiebescherming vs. branding-beschikbaarheid.** Achter één kantoor-NAT volstaan drie typefouten om iedereen 5 minuten een ongebrande loginpagina te geven. | B-511 §3 | ✅ **Afgehandeld** (WP-C5, PR #153): geïmplementeerd conform het advies via B-511 §3 — de slug-resolutie gebeurt nu vóór de blokkade-check (TenantMiddleware én `GET /organizations/by-slug/:slug`), bestaande orgs (actief én inactief) zijn nooit meer collateral en alleen écht onbekende slugs tellen mee. Bewuste trade-off gedocumenteerd in `B-511.md` §3-status: een geblokkeerd IP kan aan 429-vs-200 nog aflezen of een slug bestaat |
| **B5** | **`logoUrl` draagt twee betekenissen** — externe URL én interne storage key. `@IsUrl()` zou de uploadflow breken. | B-511 §5 (opgewaardeerd van S4) | Aparte `logoStorageKey`-kolom; beslis eerst of externe logo-URL's ondersteund blijven. **Gedeeltelijk afgehandeld** (WP-C5): minimale hygiëne zit er al — `@MaxLength(1024)` + weigering van `javascript:`/`data:`/`vbscript:`-schema's op `logoUrl` (`create-organization.dto.ts`); de kolomsplitsing zelf blijft dit beslispunt |
| **B6** | **Entitlement-vlaggen bij een plan-downgrade.** Worden `aiReviewEnabled`/`onlineRepairDefault` automatisch teruggezet? | B-510 | Ja, automatisch uitzetten — voorkomt een tegenstrijdige UI-toestand. Raakt de facturatie-/upgradeflow |
| **B7** | **"Uitnodigen voor één rapport" geeft toegang tot het hele klantdossier.** `grantPlanAccess` maakt naast de plan-grant een contact-brede `ClientAccess`. | B-411 punt 3 — inmiddels als eigen bevinding geregistreerd: **`docs/testprogramma/bevindingen/B-413.md`** | Autorisatie-ontwerpvraag. Als het antwoord "nee" is, is dat feature-werk aan het toegangsmodel (zie B-413 voor de code-analyse) |

---

## C. Feature-epics (buiten het herstelplan — beslissing D1)

Het herstelplan **mitigeert** deze drie in WP-B9 (~6 uur totaal) zodat het lek dicht is. De echte bouw is een eigen epic.

### Epic 1 — Stafzijde van het berichtenkanaal (B-402) · 2–3 dagen

Het datamodel is compleet en expliciet voorbereid op tweerichtingsverkeer: `InspectionMessage` heeft naast `clientUserId` ook `userId` (staf) en `readAt`, en `MessageAttachment` bestaat. `markRead()` markeert zelfs al *staf*-berichten als gelezen door de klant — er kan alleen nooit een staf-bericht ontstaan. Het model komt in de hele codebase op 4 plekken voor: 1× API-service, 3× client-portal. Nul referenties in de staf-portal.

| Deel | Werk | Schatting |
|---|---|---|
| a | Staf-API `GET/POST /inspection-plans/:id/messages` + `PATCH …/read`, rol-gescoped, org-scope via de bestaande plan-guards | 0,5 dag |
| b | Berichten-tab op de staf-inspectiedetailpagina + ongelezen-teller (het klantportaal-component van 125 regels is een bruikbaar sjabloon) | 1 dag |
| c | Nieuwe `NotificationType` + Prisma-migratie + groepsindeling + portal-labels + dispatch naar PM/reviewer/inspecteur, incl. e-mail | 0,5 dag |
| d | Bijlagen: upload-endpoint, storage via `STORAGE_PROVIDER`, download-route, MIME/size-validatie, UI beide kanten — **óf schrappen** (`MessageAttachment` uit het schema, ~1 uur) | 1 dag |

### Epic 2 — Stafzijde van klantverzoeken (B-403) · 1–3 dagen

Het uitstel staat letterlijk in de code (`client-requests.service.ts:6-7`, FASE6 §8). `ClientRequest` is volledig ingericht voor afhandeling (`handledBy`, `handledAt`, `responseNotes`, `resultingInspectionPlanId`, index op `[orgId, statusCode]` — een wachtrij-index), maar de enige controller is `client/requests`.

**Architectuurkeuze bepaalt de omvang:**
- **Route A — eigen wachtrij** (2–3 dagen): schoon, maar een tweede aanvragen-inbox naast de bestaande.
- **Route B — converteren naar `Request`** met `source = WEB_FORM` (1–1,5 dag): hergebruikt lijst, detail, statusflow én offerte-conversie. Twee obstakels, beide met één migratie oplosbaar: `Request.createdBy` is niet-nullable en verwijst naar `User` (een ClientUser past daar niet in → systeemgebruiker of schemawijziging), en `RequestSource` mist een `CLIENT_PORTAL`-waarde.

**Advies: route B.** Een "nieuwe opdracht" van een klant ís functioneel een aanvraag.

### Epic 3 — Tekenrecht toekennen (B-406 deel 2) · 1–2 dagen

`inspectionClientAccess` wordt in de hele API op drie plekken aangeraakt: één `upsert` in het magic-link-pad en twee leesplekken. `clientMagicLink.create` komt maar op **één** plek voor: in `forgotPassword()`. **Er is dus geen enkele manier waarop staf een klant kan uitnodigen of tekenrecht kan toekennen** — de testers moesten de grant handmatig in de DB zetten. `ClientAccess.role` (VIEWER/SIGNER/ADMIN) speelt bij ondertekenen geen enkele rol en is daarmee puur decoratief.

**Beslispunt vooraf:** wordt het klantportaal een geldig ondertekenkanaal, of blijft ondertekenen exclusief via de publieke e-maillink `/sign/:requestId`? Zonder die keuze is de fix niet af te maken.

**Werk:** staf-actie "klant uitnodigen om te ondertekenen" die de `InspectionClientAccess`-grant + magic link aanmaakt en mailt, plus een beheerscherm voor bestaande grants. Goedkoper alternatief: `ClientAccess.role = SIGNER/ADMIN` geeft voortaan tekenrecht — maar dat geldt contact-breed in plaats van per plan.

---

## D. Tech debt die uit de analyse naar boven kwam

Geen bevindingen, wel signalen die het opschrijven waard zijn:

- **Twee waarheden over AssetNode.** De staf-API heeft een compat-facade (`assets.service.ts` → `toAsset()`) die AssetNode terugvertaalt naar het oude `Asset`-contract. Werkt, maar houdt twee modellen levend. De compat-wrappers zouden na de PWA-cutover verdwijnen (zie `CLAUDE.md`).
- **Handgeschreven frontend-types.** De client-portal-types lopen los van de API-respons; daardoor ving TypeScript B-401 niet. Een gedeeld responstype of contracttest maakt die hele klasse onmogelijk.
- **Zeven verschillende paginatie-maxima** (50/100/100/200/200/500/1000) zonder beleid — WP-B6 ruimt de redundante op, maar het beleid zelf ontbreekt.
- **`z.union([z.coerce.number(), z.literal('')])` is een generiek antipattern** in de portal, geen incident (B-508). Audit alle voorkomens.
- **Geen `helmet`/CSP in `main.ts`** — er is platform-breed geen vangnet voor upload- of renderfouten (WP-B4 voegt het toe).
- **Nul Playwright-dekking op de PWA buiten één happy-path-spec.** De aanmaakflows, offline-modus, sync-conflicten, formuliervalidatie en het daadwerkelijk indienen zijn ongedekt — precies waar de S1's zaten.
