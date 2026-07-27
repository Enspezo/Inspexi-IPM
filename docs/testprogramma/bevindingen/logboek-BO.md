# Logboek — Actor Backoffice (BO-01 t/m BO-53)

**Uitvoering:** 2026-07-27, 10:25–11:50 · Portal `http://inspexidemo.localhost:5173` · API `:3001` (`NODE_ENV=test`)
**Rollen gebruikt:** MANAGER (`manager@inspexi-demo.nl`, Pieter Bakker), BACKOFFICE (`backoffice@…`, Maria Jansen),
INSPECTEUR (`inspecteur@…`, Tom Visser), ORG_ADMIN testbedrijf (`admin@testbedrijf.nl`, Lisa Mulder).

**Telling:** 43 PASS · 10 FAIL · 0 BLOCKED · 0 SKIP
**Nieuwe bevindingen:** B-301 t/m B-315 (15 stuks: 7× S2, 8× S3/S4-bundel)

> **Tooling-kanttekening:** coördinaat-klikken op de hover-dropdowns (`ActionMenu`, quick-create `+`)
> registreren in deze browser-omgeving niet betrouwbaar — de dropdown sluit op `mouseleave` (150 ms)
> tussen twee tool-calls door. Waar dat speelde is het menu-item met een echte DOM-`click()` aangeklikt.
> Dit is een beperking van de testtooling, **geen** applicatiebevinding; alle overige interacties zijn
> met gewone muisklikken uitgevoerd.

---

## CRM — contacten & relaties

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-01 | **PASS** | COMPANY-relatie "BO Testrelatie BV" aangemaakt, 2 adressen (o.a. `1012AB Amsterdam`) + 2 contactpersonen; detailpagina toont alles, inline "Bewerken" werkt en overleeft een refresh. |
| BO-02 | **PASS** | INDIVIDUAL zonder e-mail/telefoon aangemaakt (DB: `email`/`phone` = NULL); detail toont overal `—`, nergens "undefined". |
| BO-03 | **FAIL** | 220-teken naam wordt opgeslagen (backend accepteert ook 300 tekens → 201), maar de naamkolom groeit tot 1812 px en duwt álle andere kolommen uit beeld (tabel 2905 px in container 1110 px). → **B-301** |
| BO-04 | **FAIL** | `geen-email` wordt geweigerd (backend `POST /contacts` → 400 `email must be an email`), maar de UI blokkeert uitsluitend via de native `input[type=email]`-bubbel in het **Engels**; geen in-app veldfout. → **B-302** |
| BO-05 | **PASS** | Postcode `!!!` geaccepteerd en veilig getoond ("!!! Amsterdam"); leeg en `SW1A 1AA` (seed) idem. Geen NL-regex — bewust, gedocumenteerd. → B-315 §6 |
| BO-06 | **PASS** | `TP Robert'); DROP TABLE--` + notitie `<script>alert('BO-06')</script> & <img src=x onerror=alert(2)>` opgeslagen en als **tekst** getoond (`innerHTML` bevat `&lt;script&gt;`, 0 `<script>`-nodes, 0 `<img>`). Geen alert. |
| BO-07 | **PASS** | Telefoon `abcdef` geaccepteerd (`@IsString`, geen format) en veilig getoond. Gedocumenteerd. → B-315 §6 |
| BO-08 | **PASS** | Als INSPECTEUR: `GET/POST /contacts` → **403**, `PATCH /contacts/:id` → **403**; sidebar heeft geen CRM. Kanttekening: `/contacts` rendert "Geen relaties gevonden" i.p.v. een toegangsmelding en het `+ Nieuw`-menu biedt nog CRM-items. → B-315 §7 |

## Aanvragen & statusflow

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-09 | **PASS** | AANV-2026-0005 aangemaakt (bron MANUAL, status NIEUW) met eerste `imp_request_status_history`-rij (`null → NIEUW`). Leeg formulier submitten gaf nette NL-veldfouten ("Relatie is verplicht", "Titel is verplicht"). |
| BO-10 | **PASS** | Kanban-drag NIEUW → In behandeling: optimistische update, `status = IN_BEHANDELING` in de DB, historie-rij `NIEUW → IN_BEHANDELING`, overleeft refresh. Notificatie: geen `AANVRAAG_STATUS_GEWIJZIGD` (aanvraag was op dat moment aan niemand toegewezen); ná toewijzen wél `AANVRAAG_TOEGEWEZEN` naar Maria Jansen. |
| BO-11 | **PASS** | VERLOREN gezet zonder reden — geaccepteerd, `lost_reason_id`/`lost_note` blijven NULL. De UI biedt de reden-lookup helemaal niet aan terwijl het datamodel + de seed die wel kennen. Gedocumenteerd. → B-315 §1 |
| BO-12 | **PASS** | "Offerte aanmaken" vanuit de aanvraag → OFF-2026-0003 in CONCEPT, aanvraag automatisch naar OFFERTE_GEMAAKT + historie-rij. |

## Offertes — regels & grenswaarden

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-13 | **PASS** | 3 regels (2×€100, 3×€50, 1×€250 −10%) btw 21% → UI subtotaal € 575,00 / btw € 120,75 / totaal € 695,75; DB identiek (`discount_total 25.00`). |
| BO-14 | **PASS** | `unitPrice -100`: UI blokkeert via native `min=0`, backend accepteert (200). Zoals verwacht "backend accepteert (geen @Min)". Documenteerd incl. het onzinnige effect (−100 × 2 met 150% korting = **+€ 100,00**). → **B-302** |
| BO-15 | **PASS** | `discountPct 150`: backend 200, geen `@Max`. Effect op TP-OFF-010: regeltotaal −€ 250,00. → **B-302** |
| BO-16 | **PASS** | `vatRate 250` én `-50`: backend 200. Btw-berekening blijft intern consistent (TP-OFF-010: btw € 155,50 = −42 −52,50 +250). → **B-302** |
| BO-17 | **FAIL** | `quantity 0` en `0.001` → 200 ✔. `quantity 999999999` × prijs 100 → **HTTP 500 "Internal server error"** (numeric(12,2) overflow), óók bereikbaar vanuit de UI (aantalveld heeft geen max). → **B-303** |
| BO-18 | **PASS** | `quantity -1` → **400** `lines.0.quantity must not be less than 0`; offerte ongewijzigd. |
| BO-19 | **PASS** | Offerte met 0 regels: de UI blokkeert alleen vanwege een ontbrekend sjabloon ("Koppel eerst een sjabloon"). Mét sjabloon gaat `send` gewoon door → VERSTUURD met totaal € 0,00, geen crash. Binnen de verwachting ("leeg totaal"), maar wel een ontbrekende guard. → B-315 §2 |
| BO-20 | **PASS** | `NaN` / `Infinity` / `1.79e309` in een `input[type=number]` → veld wordt `0`, geen NaN in het totaal. Backend weigert de string `"NaN"` met 400. `1e9` wordt geaccepteerd (regeltotaal € 2.000.000.000,00) — zie ook B-303. |
| BO-21 | **FAIL** | Staffelprijstabel wordt nooit toegepast: bij aantal 10/50 blijft de stuksprijs € 12,50 i.p.v. € 10,00/€ 7,50. De portal stuurt geen `quantity` naar `resolve-price` en herberekent niet bij aantalwijziging (backend is wél correct). → **B-309** |

## Offertes — goedkeuringsgate & lifecycle

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-22 | **PASS** | OFF-2026-0003 (€ 695,75, onder drempel) → CONCEPT → VERSTUURD, `sent_at` gezet, publieke token toegekend, e-mail-dispatch + notificatie `OFFERTE_VERSTUURD`. |
| BO-23 | **PASS** | € 30.250 direct versturen → **400** "Deze offerte vereist goedkeuring (bedrag boven de goedkeuringsgrens…)". Status onveranderd. |
| BO-24 | **FAIL** | Backend-keten werkt (`submit-approval` 201 → approve → send → VERSTUURD), maar de **portal biedt geen "Ter goedkeuring"-actie** voor offertes die alleen door de org-drempel goedkeuring nodig hebben; beide zichtbare knoppen geven 400. Dead-end. → **B-304** |
| BO-25 | **FAIL** | Reject-deel is goed: afwijzen mét notitie → status terug naar CONCEPT, `ar.status = REJECTED`, notificatie `OFFERTE_AFGEWEZEN` naar de aanvrager. **Maar:** dezelfde MANAGER kan zijn eigen goedkeuringsverzoek indienen én goedkeuren (`requested_by = reviewed_by`) → **B-307**. Bovendien: afwijzen zonder notitie geeft de Engelse melding `note must be a string` terwijl het veld "(optioneel)" heet → **B-314**. |
| BO-26 | **PASS** | Regels wijzigen op VERSTUURD → **400** "Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden"; `PATCH /quotes/:id` → 400 "Alleen offertes met status CONCEPT kunnen bewerkt worden". UI verbergt "Bewerken" correct. Data ongewijzigd. |
| BO-27 | **PASS** | `DELETE` op VERSTUURD én op GEACCEPTEERD → **400** "Alleen offertes met status CONCEPT kunnen verwijderd worden". UI toont de knop niet. |
| BO-28 | **PASS** | `send` vanuit GEACCEPTEERD → **400**; `PATCH /status` GEACCEPTEERD→VERSTUURD → 400 "Statusovergang … niet toegestaan"; VERSTUURD→GEACCEPTEERD (BEKEKEN overslaan) → 400. Statussen in de DB onveranderd. |
| BO-29 | **FAIL** | Twee snelle klikken op "Versturen" → **2× `POST …/send` → 201**, 2× toast, 2 audit-rijen `CONCEPT→VERSTUURD`, 2 notificaties `OFFERTE_VERSTUURD` en dus 2 klant-e-mails. → **B-308** |
| BO-30 | **PASS** | "Vraag goedkeuring aan persoon" → `VOLUNTARY_PERSON`/PENDING, notificatie naar Maria Jansen, offerte blijft CONCEPT en blijft verzendbaar (niet-blokkerend); verzoek zichtbaar met "Intrekken" en door Maria goed te keuren (201). Kanttekening: de naam van de gevraagde persoon toont als `—`. → B-315 §10 |

## Publieke offerte-flow

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-31 | **PASS** | `/offerte/<token>` in anonieme context: VERSTUURD → **BEKEKEN**, `viewed_at` gezet, notificatie `OFFERTE_BEKEKEN`. Vraag stellen werkt (lege vraag doet niets); de vraag `<script>alert('vraag')</script> …` wordt als tekst opgeslagen en getoond, notificatie `NIEUWE_VRAAG_KLANT`. |
| BO-32 | **PASS** | Ondertekenen zonder naam wordt geblokkeerd; mét naam → GEACCEPTEERD, `signed_at`+`client_name`, project **P-2026-0005** en planregel **NOG_TE_PLANNEN** aangemaakt, 3× notificatie `OFFERTE_ONDERTEKEND` (maker + management). Kanttekening: bij een offerte **zonder locatie** ontstaat wél het project maar stil géén planregel. → B-315 §4 |
| BO-33 | **PASS** | Aanvraag blijft na acceptatie op OFFERTE_GEMAAKT (niet automatisch); handmatig op GEWONNEN zetten werkt met historie-rij. |

## Planning & beschikbaarheid

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-34 | **PASS** | Planregel op **2026-08-20** (vrije dag) + Tom Visser toewijzen: toewijzingsdialoog toont per inspecteur "Niet beschikbaar" (Freek, Mila) vs. beschikbaar (Tom). Na toewijzen: item CONCEPT, `acceptance_status = PENDING`, notificatie `AFSPRAAK_ACCEPTATIE_VERZOEK`. |
| BO-35 | **PASS** | Tom toewijzen op **2026-08-12** → **409** met `warnings[]` (`"Een of meer inspecteurs zijn niet beschikbaar op de geplande datum"`); DB: 0 rijen in `imp_planning_inspectors`, status blijft NOG_TE_PLANNEN. |
| BO-36 | **PASS** | Bevestigingsdialoog in het NL: "Tom Visser is niet beschikbaar op 12 augustus 2026 (Vakantie — hele dag geblokkeerd). Toch inplannen?" → "Toch inplannen" → toegewezen + `imp_planning_history` rij **AVAILABILITY_OVERRIDE**. |
| BO-37 | **PASS** | Freelancer Freek Lansier (FREELANCE, geen beschikbaarheid) op 2026-08-20 → **409 + warnings**, niet toegewezen. |
| BO-38 | **PASS** | `sessionCount 1` → 400 `must not be less than 2`; `31` → 400 `must not be greater than 30`; 2 en 30 → 201 met het juiste aantal sessies. (`isMultiDay` zonder `sessionCount` valt terug op 2 — nette default.) |
| BO-39 | **PASS** | `scheduledDate 2020-01-01` → **201**, geen guard, geen waarschuwing. Gedocumenteerd als S3. → B-315 §5 |
| BO-40 | **FAIL** | `send-confirmation` (200), publieke `/afspraak/:token` (details, sessies, `.ics` → 200 geldige VCALENDAR) en het klantverzoek tot verzetten (201) werken. **Maar** de sessietab biedt geen manier om een inspecteur aan een sessie te koppelen, waardoor "Bevestigen" nooit verschijnt en een meerdaagse planregel via de UI nooit definitief wordt (via API wél). → **B-310**. Losse waarneming: de publieke pagina biedt de klant alleen "verzetten", geen "accepteren". Bovendien lekken interne notities naar die pagina → **B-306**. |

## Inspectieplan — beheer & review

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-41 | **FAIL** | Modal "Inspectie aanmaken": de dropdown **Opdrachtgever is leeg** (alleen de placeholder) omdat `GET /contacts?limit=200` → **400**. Aanmaken via de UI is onmogelijk. Via de API werkt het wél: plan in `draft`, notificatie `INSPECTIEPLAN_TOEGEWEZEN` naar de inspecteur. Leeg formulier submitten gaf overigens keurige NL-veldfouten. → **B-305** |
| BO-42 | **PASS** | Assets-tab toont "Scope-locaties" + volledige "Objectboom" (TP Plan C, 25 assets, nodenummers). Plattegrond-tab laadt de Konva-viewer (3 canvassen, legenda Asset/Meting/Constatering, markers zichtbaar) op TP Plan A. Kanttekening: bij het demo-plan `RAP-2026-001` toont de viewer "De afbeelding kon niet worden geladen" — het bestand `…-plattegrond-demo.png` ontbreekt in `apps/api/uploads` (seed-/omgevingsartefact, geen crash). |
| BO-43 | **PASS** | "Indienen" op een plan in `planned`/`draft` → **400** met NL-toast "Alleen plannen die in uitvoering zijn kunnen ter review ingediend worden"; status onveranderd. |
| BO-44 | **PASS** | TP-RAP-004 `pending_review` → **Goedkeuren** → status `approved`, `reviewed_at`+`approved_at` gezet, notificatie `INSPECTIEPLAN_GOEDGEKEURD` naar de inspecteur (+ org-admin). Kanttekening: `reviewer_id` blijft NULL. → B-315 §9 |
| BO-45 | **PASS** | TP-RAP-003 → **Afkeuren** → status `reviewed`, `approved_at` blijft NULL (niet terug naar in_progress), notificatie `INSPECTIEPLAN_AFGEKEURD`. Kanttekening: afkeuren kan zonder toelichting. → B-315 §8 |
| BO-46 | **PASS** | Vier-ogen-gate houdt stand: `statusCode: completed` en `approved` vanuit `draft` én vanuit `in_progress` → **400** "Dit plan moet eerst beoordeeld worden (vier-ogen-principe)". `status`/`reviewedAt` zijn niet eens accepteerbare velden in de PATCH-DTO (400 "property … should not exist"). |

## Documentgeneratie & ondertekening

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-47 | **PASS** | In deze org bestaat alleen een **PLAN**-documenttemplate (geen REPORT) → "Rapport genereren" geeft een nette NL-toast "Plan heeft geen inspectie-template" resp. 404 "Document-template niet gevonden". Getest met **Inspectieplan genereren**: 201, en de injectiedata is correct geëscaped (`&lt;script&gt;alert(1)&lt;/script&gt;`, `TP Robert&#x27;); DROP TABLE--`), 0 live `<script>`/`onerror`. Preview opent een modal met de PDF (in deze browser-pane rendert de PDF-plug-in niet; hetzelfde bestand opent buiten de app correct). Nevenvondsten: **B-311** (`{{organization.name}}` in de kop) en **B-313** (`inspectionTemplateId` niet te PATCHen). |
| BO-48 | **PASS** | `export-pdf`/`export-word` → 201 met download-URL; `download?format=pdf` → geldige **PDF 1.4** (97 kB, 1 pagina), `format=word` → geldig **Word 2007+** (9 kB). Beide bevatten de juiste projectgegevens en de geëscapete injectiestrings. Kanttekeningen: **B-311**, **B-312** (CJK verdwijnt uit de PDF), en een onbekende `format` valt stil terug op PDF. |
| BO-49 | **PASS** | `request-signature` (rolcode `CLIENT`) → 201, document gaat van `DRAFT` naar **PENDING_SIGNATURES**; signature-rij aangemaakt met token. (Lowercase `client` uit `imp_signatory_types` wordt geweigerd — de UI gebruikt de juiste lookup, dus geen gebruikersimpact.) |
| BO-50 | **FAIL** | Document voor de relatie met 220-teken naam + emoji + CJK: de tabelrij loopt van de pagina af (geen `word-break`/`table-layout: fixed`) én de Chinese tekens `测试` verdwijnen volledig uit de PDF (Word behoudt ze). Emoji renderen wel. → **B-312** |
| BO-51 | **PASS** | Als INSPECTEUR toont de Documenten-tab op een approved plan géén "Inspectieplan genereren"/"Rapport genereren"; alleen de bestaande documenten met Preview/PDF/Word. UI verbergt de actie dus correct. (API-zijde blijft open: zie B-101 t/m B-104.) |

## Feature-gating per rol/plan

| ID | Resultaat | Waarneming |
|---|---|---|
| BO-52 | **PASS** | `testbedrijf` (Basis-plan) als ORG_ADMIN: sidebar bevat alléén Relaties, Projecten, Inspecties, Assets, Meetmiddelen, Inspecteurs, Organisatie, Profiel, Help. Aanvragen/Offertes/Documenten/Planning ontbreken volledig. Geen crash, geen console-fouten. |
| BO-53 | **PASS** | Directe URL `/quotes` → **"Geen toegang — Deze functie zit niet in uw abonnement. Neem contact op met uw beheerder."** Geen data, geen crash. Idem voor `/requests`, `/planning`, `/documents`, `/quotes/123`, `/price-tables`. |

---

## Opruimen — wat is verwijderd en wat is bewust blijven staan

**Verwijderd:**
- Eigen relaties: `BO XXXX…` (300-teken test) en `BO Particulier Zonder Contact` (soft-deleted via API).
- Eigen aanvraag `AANV-2026-0005` (soft-deleted).
- Eigen inspectieplannen `BO-RAP-041`, `BO-RAP-047`, `BO-RAP-050` incl. de gegenereerde documenten.
- Eigen offerte voor de staffeltest (CONCEPT, verwijderd via API).
- Eigen planregels (`BO-35 geblokkeerde dag`, `BO-37 freelancer`, `BO-39 datum in verleden`,
  `BO-38 sessies 2/30/zonder count`) incl. sessies, inspecteurs, historie en notificaties.
- Het door de publieke flow aangemaakte verzoek-tot-verzetten op `TP Planning — gepland 10 aug`.

**Hersteld naar de seed-toestand:**
- `TP-OFF-002` terug op **TER_GOEDKEURING** met een PENDING `THRESHOLD`-goedkeuringsverzoek
  (na de reject-test van BO-25; opnieuw indienen via de API lukt niet omdat het fixture geen sjabloon heeft,
  dus dit is via SQL rechtgezet).
- `TP Planning — nog te plannen` terug op **NOG_TE_PLANNEN**, zonder datum, duur of toegewezen inspecteur.

**Bewust blijven staan (kan niet via de applicatie verwijderd worden of is testresultaat):**
- Relatie **`BO Testrelatie BV`** — nog gekoppeld aan de niet-verwijderbare offertes hieronder.
- Offertes **OFF-2026-0003** (GEACCEPTEERD, met project P-2026-0004), **OFF-2026-0004** (VERSTUURD, 0 regels),
  **OFF-2026-0005** (VERSTUURD), **OFF-2026-0006** (GOEDGEKEURD), **OFF-2026-0008** (GEACCEPTEERD,
  met project P-2026-0005 + planregel). Niet-CONCEPT offertes zijn per ontwerp niet verwijderbaar (BO-27).
- **TP-RAP-003** staat nu op `reviewed` (afgekeurd) en **TP-RAP-004** op `approved` — dat zijn precies de
  uitkomsten van BO-44/BO-45 en dus geen ongewenste rest.
- **TP-OFF-001** heeft een afgehandeld (APPROVED) *vrijwillig* goedkeuringsverzoek uit BO-30; de offerte
  zelf staat nog op CONCEPT en blijft bruikbaar.
- **TP-OFF-004** (`tp-offerte-verstuurd`) en **TP-RAP-005** (approved, REPORT-document in
  `PENDING_SIGNATURES`, opdrachtgever-handtekening nog open) zijn **niet aangeraakt** en blijven
  beschikbaar voor de KL/PUB-tests.
