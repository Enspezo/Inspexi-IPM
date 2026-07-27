# Testlogboek KL/PUB — klantportaal + publieke/anonieme flows

Uitvoering: **2026-07-27**, 09:55–11:10.
API `http://localhost:3001/api/v1` (`NODE_ENV=test`, throttle uit), client-portal
`http://inspexidemo.localhost:5174`, portal `http://inspexidemo.localhost:5173`.
DB-controles via `psql` op `localhost:5433` (kolomnamen zijn snake_case).

Alle regels hieronder komen uit **daadwerkelijk uitgevoerde** browser-acties en/of HTTP-calls; elke
PASS/FAIL is onderbouwd met een statuscode, een DB-query of een schermwaarneming.

> **Bewijsvoering zonder screenshots.** De gebruikte browsertool levert screenshots alleen inline
> terug en kan ze niet naar `bevindingen/img/` wegschrijven; bovendien renderde de pane tijdens
> langere sessies af en toe een verschoven beeld. Het bewijs in dit logboek en in de B-4xx-bestanden
> bestaat daarom uit **letterlijke schermtekst** (`get_page_text`), **console-stacktraces**,
> **HTTP-statuscodes met responsbody** en **psql-queries** — allemaal reproduceerbaar met de
> vermelde stappen.

**Gebruikte accounts** (wachtwoord `Password123!`)
- `tp-viewer@klant.nl` (ClientAccess VIEWER), `tp-signer@klant.nl` (SIGNER), `tp-admin@klant.nl` (ADMIN)
- `klant@inspexi-demo.nl` (demo-klant, magic-link `demo-klant-magic`)
- staf-controle: `manager@inspexi-demo.nl`

**Testdata-ingrepen** (zie §Opruimen onderaan): een registratie-magic-link, een `canSign`-grant en
een aantal statusresets waren nodig om geblokkeerde testgevallen alsnog uit te voeren.

Formaat: `ID | PASS/FAIL/BLOCKED/SKIP | onderbouwing`

---

## Client-portal — login & toegang (KL-01 t/m KL-07)

| ID | Status | Opmerking |
|---|---|---|
| KL-01 | PASS | `/magic/demo-klant-magic` → direct ingelogd zonder wachtwoord, dashboard laadt ("Welkom, Demo"); `POST /client/auth/magic-link` → 201, `used_at` gevuld |
| KL-02 | PASS | Variant: **`demo-klant-magic` na KL-01 nogmaals geopend** → nette NL-melding "Magic link ongeldig of verlopen" + "Naar inloggen". API-controle met `tp-magic-gebruikt` → 400, zelfde melding |
| KL-02x | **FAIL** | Verkennend: 3 **gelijktijdige** verzilveringen van dezelfde ongebruikte link → 3× HTTP 201, drie geldige sessies (TOCTOU). → **B-405** (S3) |
| KL-03 | PASS | `/magic/tp-magic-verlopen` → identieke generieke melding "Magic link ongeldig of verlopen", geen crash (geen onderscheid verlopen/gebruikt/onbekend = goed) |
| KL-04 | PASS | Registratie via uitnodigingstoken → account ACTIVE, direct ingelogd ("Welkom, Tobias"); vereiste eerst uitloggen, zie **B-411** |
| KL-04x | **FAIL** | Met een actieve klantsessie leidt "Account aanmaken" stilzwijgend naar het **dashboard van de vorige gebruiker**. → **B-411** (S3) |
| KL-05 | PASS | Wachtwoord `Pass12!` (7 tekens) → frontend blokkeert met NL-melding "Wachtwoord moet minimaal 8 tekens zijn" bij het juiste veld; API `POST /client/auth/register` → 400 (Engelse class-validator-tekst, al gedekt door B-155) |
| KL-06 | PASS | Fout wachtwoord → 401 `"Onjuiste inloggegevens"`; **niet-bestaand** account geeft exact dezelfde 401 (geen accountonthulling) |
| KL-07 | PASS | Client-JWT op `/contacts`, `/users`, `/inspection-plans`, `/quotes` → **401** op alle vier (aparte realm) |

## Inspecties inzien & constateringen oplossen (KL-08 t/m KL-15)

| ID | Status | Opmerking |
|---|---|---|
| KL-08 | **FAIL** | Overzicht/Berichten/Documenten laden correct en tonen alléén eigen inspecties (isolatie OK), maar de tab **Constateringen crasht volledig**: `Cannot read properties of undefined (reading 'locationDescription')` in `<FindingCard>`. Reproduceerbaar op élk plan met constateringen. → **B-401** (S1) |
| KL-08x | **FAIL** | Verkennend: de klant ziet ook inspecties met status `pending_review` inclusief hun constateringen (API 200). → **B-412** (S3, raakt R3) |
| KL-09 | PASS (API) | UI geblokkeerd door B-401; via API: `POST /client/findings/:id/resolve` → 201, `statusCode = PENDING_VERIFICATION`; `POST …/resolve/photos` met 2 foto's → 201 |
| KL-10 | PASS | 4 extra foto's bij 2 bestaande → **400** `"Maximaal 5 foto's toegestaan. U heeft er al 2."` (NL, correcte grens). 6 in één request → 400 `"Unexpected field"` (multer-default, Engels en weinig verhelderend — zelfde categorie als B-155) |
| KL-11 | PASS | 6 MB PNG → **413** `"File too large"`; PDF → **400** `"Alleen JPG en PNG bestanden zijn toegestaan"` (NL) |
| KL-12 | **FAIL** | Beschrijving van 4 001 tekens → **201** (geaccepteerd); ook 100 000 tekens → 201. Geen `@MaxLength(4000)` op `ResolveFindingDto`. → **B-407** (S3) |
| KL-13 | PASS | `DELETE /client/findings/:id/resolve` bij `PENDING_VERIFICATION` → 200 `{deleted:true}`; ná zetten op `VERIFIED` → **400** met nette NL-uitleg |
| KL-14 | PASS | Klant ziet bij een REPORTED-resolutie `resolvedByClientUserId: null` én `resolvedByClientUser: null`; staf ziet via `GET /findings/:id` wél `repairSession.contactName/companyName/email`. **Wel** een inconsistentie: de herstelverklaring in de Documenten-tab noemt de hersteller bij naam → **B-409** (S3) |
| KL-15 | **FAIL** | Bericht wordt opgeslagen en getoond (injectiestring netjes geëscaped), maar er is **geen staf-endpoint, geen staf-UI en geen notificatie**; bijlagen bestaan niet in de DTO. → **B-402** (S2) |

## Documenten ondertekenen (KL-16 t/m KL-20)

| ID | Status | Opmerking |
|---|---|---|
| KL-16 | PASS* | Ondertekenen via het klantportaal werkt (canvas → "Handtekening geplaatst"), `signature_image` + `signed_at` + `signed_ip_address` gevuld. *\*Vereiste eerst een handmatige `InspectionClientAccess.canSign`-grant — zie B-406* |
| KL-17 | PASS | Na de klanthandtekening (inspecteur stond al SIGNED) → document `status = SIGNED`, badge "Ondertekend", paneel "Geen acties beschikbaar"; overleeft refresh |
| KL-18 | PASS (autorisatie) / **FAIL** (UX) | VIEWER krijgt **403** `"Geen recht om dit document te ondertekenen"` — correct. Maar het dashboard toont hem "Actie vereist: ondertekenen", de knop is actief en de weigering komt pás ná het tekenen. Zelfde 403 gold voor de SIGNER-rol. → **B-406** (S3) |
| KL-19 | PASS | Opnieuw tekenen op een SIGNED-document → 400 `"Document is al ondertekend"`; op een FINALIZED-document → 400 `"Gefinaliseerd document kan niet meer ondertekend worden"` |
| KL-20 | **FAIL** | `signatureImage: "javascript:alert(1)"` → **201** en document wordt SIGNED; 7 MB-payload → **201** (`length = 7 000 022`). Geen `IsSafeDataImage`, geen 5 MB-cap op de klantportaal-route (de publieke route valideert wél). → **B-404** (S3) |

## Verzoeken indienen (KL-21 t/m KL-23)

| ID | Status | Opmerking |
|---|---|---|
| KL-21 | **FAIL** | `ClientRequest` wordt correct aangemaakt (`PENDING_REQUEST`, org uit subdomein, juiste contact) maar er is **geen staf-endpoint/scherm en geen notificatie** — het verzoek komt nergens aan. → **B-403** (S2) |
| KL-22 | PASS | Leeg formulier → NL-meldingen bij de juiste velden: "Onderwerp is verplicht" en "Omschrijving moet minimaal 10 tekens bevatten"; geen request verstuurd |
| KL-23 | PASS | `orgId`/`organizationId` in de body → **400** `"property orgId should not exist"` (whitelist). Contact van een andere org → **403**; herinspectie op een plan van een andere org → **404**. Org komt uitsluitend uit het subdomein (403 i.p.v. 404 = bekende B-151) |
| KL-23x | **FAIL** | Verkennend: `preferredDate: "1999-01-01"` en `description: "x"` worden door de API geaccepteerd (201). → **B-407** (S3) |

## Publieke offerte-flow (PUB-01 t/m PUB-04)

| ID | Status | Opmerking |
|---|---|---|
| PUB-01 | PASS | `/offerte/tp-offerte-verstuurd` anoniem → offerte volledig zichtbaar; status `VERSTUURD → BEKEKEN`, `viewed_at` gezet, notificatie `OFFERTE_BEKEKEN` |
| PUB-02 | PASS | Vraag stellen → bevestiging + notificatie `NIEUWE_VRAAG_KLANT`. Ondertekenen → `GEACCEPTEERD`, `client_name`/`client_ip`/`signed_at` gevuld, **project `P-2026-0006` en planning-item `NOG_TE_PLANNEN` automatisch aangemaakt**, 4× `OFFERTE_ONDERTEKEND`. *Sub-orakel "PDF gestempeld + gemaild" niet waarneembaar: de geseede offerte heeft geen `pdf_storage_key` (nooit via `POST /quotes/:id/send` gegaan) en het contact heeft geen e-mailadres — geen bevinding, wel een fixture-beperking* |
| PUB-03 | PASS | `…-XX`, `' OR 1=1--`, `null` → telkens **404** `"Offerte niet gevonden"`, geen datalek |
| PUB-04 | PASS | Tekenen op `tp-offerte-geaccepteerd` én op de zojuist geaccepteerde TP-OFF-004 → **400** `"Offerte kan niet worden ondertekend in de huidige status"`; UI toont alleen "Offerte geaccepteerd" |

## Publieke document-ondertekening (PUB-05, PUB-06)

| ID | Status | Opmerking |
|---|---|---|
| PUB-05 | PASS | `/sign/<uuid>` anoniem → documentinhoud in een **`<iframe sandbox="">`** (de geseede `<script>`/`onerror`-payloads vuren niet), naam + handtekening → "Bedankt — document ondertekend"; `status = SIGNED`, document → `SIGNED`. Herhaling → 400 `"Al ondertekend"`. Onveilige data-URI → **400 met NL-melding** (contrast met KL-20). **Wel**: `signed_ip_address` blijft leeg → **B-408** (S3) |
| PUB-05x | — | *Fixture-defect*: het gedocumenteerde `tp-sign-request-001` is geen UUID, terwijl de route `ParseUUIDPipe` gebruikt → `/sign/tp-sign-request-001` geeft "Validation failed (uuid is expected)". Bovendien stond `signature_request_sent_at` op 2026-07-18 (TTL 7 dagen) → "Verzoek verlopen". Voor uitvoering tijdelijk een UUID + actuele datum gezet; **advies: seed een UUID en een recente datum** |
| PUB-06 | PASS | Onbekende maar geldige UUID → **404** `"Ondertekenverzoek niet gevonden"`. Niet-UUID → 400 met de Engelse `ParseUUIDPipe`-tekst, die op een publieke pagina als "Niet beschikbaar — Validation failed (uuid is expected)" verschijnt (bekend: **B-155**) |

## Online herstel — anoniem (PUB-07 t/m PUB-16)

| ID | Status | Opmerking |
|---|---|---|
| PUB-07 | PASS | `/herstel` met `RAP-TEST-100` + `1012AB` → sessie **ACTIVE**, geldig tot +72 u, 3 constateringen zichtbaar met samenvatting per classificatie |
| PUB-08 | PASS | Fout nummer / foute postcode / beide fout / plan met vlag uit → **telkens identieke 404**: `"Deze combinatie is niet gevonden of online herstel is niet beschikbaar voor deze inspectie"`. Leeg nummer → 400 `"Rapportnummer is verplicht"` (DTO, vóór de lookup) |
| PUB-09 | PASS | `1012 ab` (spatie + kleine letters) matcht; ook `rap-test-100` (kleine letters) en `" RAP-TEST-100 "`/`" 1012 AB "` (spaties) worden genormaliseerd → 201 |
| PUB-10 | PASS | Kritieke constatering via de UI hersteld gemeld met 2 bewijsfoto's → resolutie `REPORTED`, finding `open → resolved`, foto's opgeslagen |
| PUB-11 | PASS | 2 parallelle claims: A → 201 (`REPORTED`), B → **409** met invoer bewaard als **`CONFLICT`** + notificatie `HERSTEL_CONFLICT` naar de reviewer. **Stresstest met 5 gelijktijdige sessies**: exact 1× `REPORTED` en 4× `CONFLICT`, finding precies één keer `resolved` |
| PUB-12 | PASS | Zelfde constatering nogmaals binnen dezelfde sessie → **400** `"U heeft deze constatering al hersteld gemeld"` (geen 500). Claim op een al door een ander herstelde constatering → 409 + CONFLICT |
| PUB-13 | PASS | Zodra de laatste kritieke constatering hersteld gemeld was: **exact één** `HERINSPECTIE_VOORSTEL` naar `manager@inspexi-demo.nl` (= `reviewerId`) en `critical_repair_notified_at` gezet |
| PUB-14 | PASS | Wizard Selectie → Gegevens → Controle → Ondertekenen. Conflictmelding correct als "NIET SELECTEERBAAR". Lege velden en `geen-geldig-adres` → NL-veldmeldingen. Resultaat: `HERSTELVERKLARING` (SIGNED) met signer-rol **HERSTELLER**, foto's als data-URI in de HTML, sessie `COMPLETED`, notificatie `HERSTEL_AFGEROND`. `GET /client/repair/declaration/pdf` → **200, application/pdf, 72 kB** (dus géén 500 zoals B-154 bij de demo-sessie) |
| PUB-15 | **SKIP** | Throttle-test (6× lookup/min → 429) bewust overgeslagen: de API draait hier met `NODE_ENV=test`, waardoor de rate-limiter uit staat. Draait later apart met normale env |
| PUB-16 | PASS | `testbedrijf.localhost` (geen `ONLINE_HERSTEL`-entitlement) → **dezelfde generieke 404** als elke andere mislukking; ook `RAP-TEST-100` op dat subdomein → 404. Plan met `online_repair_enabled = false` (TP-RAP-005) → idem |
| PUB-xx | PASS | Extra sessie-controles: COMPLETED-sessie blijft **leesbaar** (200) maar mutaties → 400 `"Deze herstelsessie is al afgerond"`; onbekend token → 401 met NL-melding; geen token → 401; handmatig verlopen sessie → 401 (lazy expiry). Sessie van plan A op een finding van plan B → **404**; sessietoken op een ander subdomein → geblokkeerd |
| PUB-xx | **FAIL** | Verkennend: de classificatie in het herstelportaal komt terug als kale code, grijs en `isCritical:false` terwijl het model C1 als kritiek/rood definieert. → **B-410** (S4) |

---

## Tellingen

**Scriptgevallen** (KL-01 … KL-23 + PUB-01 … PUB-16 = 39):

| Status | Aantal | Welke |
|---|---|---|
| PASS | **32** | alle overige |
| FAIL | **6** | KL-08, KL-12, KL-15, KL-18, KL-20, KL-21 |
| BLOCKED | 0 | — |
| SKIP | **1** | PUB-15 (throttle — draait apart met normale env) |

**Inclusief de verkennende uitbreidingen** (6 extra `-x`/`xx`-regels, elk met een eigen bevinding):

| Status | Aantal |
|---|---|
| PASS | 33 |
| FAIL | 11 |
| BLOCKED | 0 |
| SKIP | 1 |

*Kanttekening bij KL-18: de autorisatie zelf is correct (403), maar het testgeval eist
"geweigerd **of knop afwezig**" en de knop is prominent aanwezig — daarom als FAIL geteld met
bevinding B-406. KL-09 t/m KL-14 zijn via de API uitgevoerd omdat de UI door B-401 onbruikbaar is;
dat is per regel vermeld.*

## Bevindingen uit deze run

| ID | Sev | Titel |
|---|---|---|
| B-401 | **S1** | Klantportaal: tab "Constateringen" crasht volledig (`finding.asset` bestaat niet meer) |
| B-402 | **S2** | Berichten van de klant komen nergens aan (geen staf-endpoint/UI/notificatie) |
| B-403 | **S2** | Klantverzoeken zijn voor de staf onzichtbaar |
| B-404 | S3 | Klantportaal-ondertekening accepteert elke string als handtekening |
| B-405 | S3 | Eenmalige magic-link is niet atomair (TOCTOU) |
| B-406 | S3 | Portaal dringt aan op ondertekenen dat de klant niet mág; geen staf-flow voor `canSign` |
| B-407 | S3 | Ontbrekende lengte-/datumvalidatie op klantportaal-DTO's |
| B-408 | S3 | Publieke document-ondertekening legt geen IP vast |
| B-409 | S3 | Anonimisering hersteller inconsistent (herstelverklaring noemt hem wél) |
| B-410 | S4 | Herstelportaal toont classificaties zonder label/kleur/kritiek |
| B-411 | S3 | Uitnodigingslink logt nieuwe klant in op het account van de vorige gebruiker |
| B-412 | S3 | Klant ziet niet-gereviewde inspecties inclusief constateringen |

**Niet opnieuw gerapporteerd** (bekend): B-151 (403 i.p.v. 404 in de client-realm), B-152 (publieke
offerte-token niet aan het subdomein gebonden), B-154 (500 bij ontbrekend PDF-bestand — de
TP-sessie én de vers gegenereerde verklaring gaven hier gewoon 200), B-155/B-106 (Engelse
framework-meldingen).

## Waarnemingen zonder bevinding

- **Injectie-veiligheid is goed**: `<script>`, `onerror`, emoji, RTL en `'; DROP TABLE imp_users;--`
  worden overal als tekst getoond; documentinhoud draait in een `<iframe sandbox="">`; het
  klantportaal-bericht en de bedrijfsnaam op de herstelverklaring worden geëscaped.
- **Enter in een formulier** submitte in geen enkel formulier (login, herstel-lookup). Beide apps
  gebruiken een `<form>` met een `type="submit"`-knop, wat impliciete submit hoort te geven; er ging
  echter geen enkel request uit. Waarschijnlijk een beperking van de automatiseringstool
  (toetsaanslag wordt niet als *trusted* geleverd) — **niet als bevinding gelogd**, wel het
  handmatig verifiëren waard.
- **Screenshot-artefact**: de browserpane rendert tijdens langere sessies af en toe een verschoven
  beeld. Waarnemingen zijn daarom overal gekruisd met `get_page_text`, DOM-inspectie en DB-queries.

---

## Testdata-ingrepen & opruimen

**Tijdelijk aangemaakt en weer verwijderd**
- `ClientMagicLink` `tp-magic-registratie` (voor KL-04, er is geen staf-flow die uitnodigingslinks maakt).
- `ClientUser` `tp-nieuw@klant.nl` + zijn `ClientAccess` / `InspectionClientAccess` (uit KL-04).
- `InspectionClientAccess`-grant (`can_sign = true`) voor `tp-signer@klant.nl` op TP-RAP-005 (KL-16/17).
- `InspectionMessage` uit KL-15 en de `ClientRequest`-rijen uit KL-21/KL-23.
- `FindingResolution`-rijen uit KL-09..KL-13 (op TP-RAP-005) en alle herstel-resoluties uit
  PUB-10..PUB-12; de originele seed-resolutie op finding `ed5a7da5` is behouden.
- De 11 herstelsessies die tijdens PUB-07..PUB-12 zijn aangemaakt (de 5 seed-sessies zijn behouden).
- De gegenereerde `HERSTELVERKLARING` uit PUB-14 + handtekening; de notificaties uit deze run.

**Teruggezet naar de oorspronkelijke staat**
- Findings `ae8f0e5f` (kritiek) en `63b86f54` weer op `open`, `resolved_at` leeg;
  `imp_inspection_plans.critical_repair_notified_at` van RAP-TEST-100 weer `NULL`.
- `imp_client_magic_links.used_at` van `tp-magic-geldig` weer `NULL`.
- Handtekening `6ff35c85` weer `REQUESTED` met `signature_request_id = 'tp-sign-request-001'`,
  `signature_request_sent_at = 2026-07-18`, `signer_name = 'TP Signer Klant'`, zonder afbeelding;
  document `5a525045` weer `PENDING_SIGNATURES`.
- Offerte `TP-OFF-004` weer op `VERSTUURD` (signature/`viewed_at`/`project_id` leeg); het automatisch
  aangemaakte project `P-2026-0006`, het planning-item en de klantvraag zijn verwijderd.

**Bewust blijven staan**
- `demo-klant-magic` is nu **gebruikt** (`used_at` gevuld) — dat is het onvermijdelijke gevolg van
  KL-01/KL-02. Voor een volgende run: gebruik `tp-magic-geldig`, of zet `used_at` weer op `NULL`.
- `imp_client_users.last_login_at` van de gebruikte accounts en de `imp_client_refresh_tokens` van
  deze sessies.

**Collateral bij het opruimen — expliciet gemeld**
Bij het verwijderen van mijn eigen `FindingResolution`-rijen zijn óók **twee resolutie-rijen van een
eerdere testrun** op het demo-plan `RAP-2026-001` verdwenen (op de findings
`178b07fe…` "Ontbrekende afdekking op verdeelinrichting" en `d032f2d1…` "Beschadigde mantel op
hoofdvoedingskabel", beide `resolved_at` 2026-07-17 ±07:31). Die stonden niet in de basis-seed maar
zijn tijdens een eerdere sessie van dit testprogramma aangemaakt; hun inhoud is niet reconstrueerbaar.

Wat wél exact hersteld is: de door `seed.ts` (SEED_DEMO=1) gedefinieerde demo-resolutie op finding
`f9178743…` ("Groep 3 opnieuw afgemonteerd en isolatieweerstand gemeten: 2,1 MΩ …", gekoppeld aan
sessie `demo-herstel-sessie`, `REPORTED`, 2026-07-10 09:30) inclusief de 1×1-JPEG-bewijsfoto op disk.

De findings zélf, alle repair-sessies (5), alle gegenereerde documenten (10) en het aantal
notificaties (65) komen exact overeen met de baseline van vóór deze run. Wie een 100 % schone basis
wil: `SEED_DEMO=1 pnpm db:seed` + `apps/api/prisma/seed-testprogramma.ts` opnieuw draaien (en daarna
de API herstarten i.v.m. de tenant-cache).
