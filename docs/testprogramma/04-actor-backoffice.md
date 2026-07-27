# Actor: Backoffice (MANAGER / BACKOFFICE / WERKVOORBEREIDER) — testscript (BO-xx)

**Login:** `http://inspexidemo.localhost:5173`
- MANAGER: `manager@inspexi-demo.nl` · BACKOFFICE: `backoffice@inspexi-demo.nl` · WERKVOORBEREIDER: `werkvoorbereider@inspexi-demo.nl` (allen `Password123!`)

**Rechten:** CRM, offertes, planning, projecten, inspectiebeheer/review, documenten (afhankelijk van rol + feature-plan).
**Risicogebieden:** R2 (offerte-lifecycle+goedkeuring), R3 (review-gate), R6 (validatie), R9 (planning/beschikbaarheid), R8 (documenten).

---

## CRM — contacten & relaties

| ID | T | Stap / invoer | Verwacht (orakel) |
|---|---|---|---|
| BO-01 | G | Relaties → nieuw COMPANY-contact, compleet met adres `1012AB Amsterdam`, 2 contactpersonen | Aangemaakt; detailpagina toont alles; inline "Bewerken" werkt |
| BO-02 | G | Nieuw INDIVIDUAL-contact **zonder e-mail/telefoon** | Aangemaakt; lege velden tonen `—` (geen "undefined") |
| BO-03 | B | companyName van 200+ tekens | Aangemaakt (geen backend-max); overzicht kapt netjes af, breekt layout niet |
| BO-04 | F | E-mail `geen-email` (zonder @) | Geweigerd (`@IsEmail`), veldfout |
| BO-05 | F | Postcode `!!!` / buitenlands `SW1A 1AA` / leeg | Geaccepteerd (geen NL-regex backend/frontend) — documenteer of dat gewenst is (S3-kandidaat); moet in elk geval veilig tonen |
| BO-06 | F | companyName `Robert'); DROP TABLE--` + notitie `<script>alert(1)</script>` | Opgeslagen én veilig geëscaped in lijst/detail; **geen** alert-popup |
| BO-07 | F | Telefoon met letters `abcdef` | Geaccepteerd (`@IsString`, geen format) — documenteer |
| BO-08 | A | Als **INSPECTEUR** proberen een contact aan te maken/bewerken | Geen schrijfrechten (menu afwezig of 403) |

## Aanvragen (Request) & statusflow

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-09 | G | Nieuwe aanvraag (bron MANUAL) · status NIEUW | Aangemaakt met eerste statushistorie |
| BO-10 | G | Kanban: sleep NIEUW → IN_BEHANDELING | Optimistische update; persisteert na refresh; notificatie |
| BO-11 | A | Zet status naar VERLOREN **zonder** reden | Reden verplicht? Verifieer; anders documenteer |
| BO-12 | G | Maak offerte vanuit aanvraag | Offerte in CONCEPT; aanvraag springt auto naar OFFERTE_GEMAAKT |

## Offertes — opstellen, regels & grenswaarden (kern-risico R2/R6)

| ID | T | Stap / invoer | Verwacht |
|---|---|---|---|
| BO-13 | G | Offerte-editor: 3 regels met normale aantallen/prijzen, btw 21% | Totaal + btw kloppen |
| BO-14 | F | Regel met `unitPrice` = **-100** | Backend accepteert (geen @Min); UI-hint `min=0`. **Documenteer**: wordt het totaal negatief/onzin? (S3) |
| BO-15 | F | Regel met korting **150%** | Backend accepteert (geen @Max op discountPct). Documenteer totaaleffect |
| BO-16 | F | Regel met vatRate **250** / negatief | Backend accepteert; controleer btw-berekening |
| BO-17 | B | Aantal = 0 · aantal = 0,001 · zeer groot `999999999` | 0 en decimalen toegestaan (`@Min(0)`); geen overflow in weergave |
| BO-18 | F | Aantal = `-1` | Geweigerd (`@Min(0)`) |
| BO-19 | F | Offerte met **0 regels** versturen | Blokkeren of leeg totaal — geen crash |
| BO-20 | F | Plak `NaN`/`Infinity`/`1e9` in prijsveld | Nette afhandeling; geen NaN in totaal |
| BO-21 | G | Klantgroep-contact met staffelprijstabel → regel pakt staffelprijs | Juiste prijs uit tier |

## Offertes — goedkeuringsgate & lifecycle (R2)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-22 | G | Offerte < € 10.000 (drempel) → direct versturen | CONCEPT → VERSTUURD; e-mail + publieke token |
| BO-23 | A | Offerte > € 10.000 → probeer direct versturen | Geblokkeerd 400 "goedkeuring vereist" |
| BO-24 | G | > drempel: submit-approval → als MANAGER approve → versturen | CONCEPT→TER_GOEDKEURING→GOEDGEKEURD→VERSTUURD |
| BO-25 | A | Approver = zelfde persoon als aanvrager? / reject → terug naar CONCEPT | Reject zet status terug CONCEPT met notificatie |
| BO-26 | A | Regels wijzigen op offerte in status VERSTUURD | Geblokkeerd 400 "alleen bij CONCEPT" |
| BO-27 | A | Verwijderen van niet-CONCEPT offerte | Geblokkeerd 400 |
| BO-28 | A | Versturen van al GEACCEPTEERDE offerte (ongeldige overgang) | Geblokkeerd 400, status onveranderd |
| BO-29 | F | Dubbelklik "Versturen" (twee snelle clicks) | Idempotent: niet 2× verstuurd, geen dubbele mail |
| BO-30 | G | Vrijwillige goedkeuring (team/persoon) aanvragen | Niet-blokkerend; verzoek zichtbaar, afhandelbaar |

## Publieke offerte-flow (kruisverwijzing PUB)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-31 | G | Open publieke `/offerte/:token` in anonieme context → 1e keer | VERSTUURD → BEKEKEN; klant kan vraag stellen |
| BO-32 | G | Klant tekent → project + planningitem auto-aangemaakt | GEACCEPTEERD; project (projectnummer) + planning NOG_TE_PLANNEN ontstaan; notificatie naar maker+management |
| BO-33 | A | Aanvraag daarna handmatig op GEWONNEN zetten | Statuskeuze werkt (niet automatisch) |

## Planning & beschikbaarheid (R9)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-34 | G | PlanningItem → sessie → wijs `inspecteur@inspexi-demo.nl` toe op vrije dag | Sessie CONCEPT; acceptatie PENDING; notificatie |
| BO-35 | A | Wijs inspecteur toe op dag met **GEBLOKKEERD**-uitzondering | **409 + warnings**; toewijzing niet doorgevoerd |
| BO-36 | G | Zelfde met `overrideAvailabilityWarnings` (bevestig dialoog) | Toegewezen; PlanningHistory-record AVAILABILITY_OVERRIDE |
| BO-37 | A | Wijs **freelancer zonder beschikbaarheid** (`inspecteur2`) toe | 409 (freelancer standaard niet beschikbaar) |
| BO-38 | B | Meerdaags: sessieCount 1 (te laag) en 31 (te hoog) via API | Geweigerd (`@Min(2) @Max(30)`) |
| BO-39 | F | `scheduledDate` in het **verleden** (01-01-2020) | Geaccepteerd (geen guard) — documenteer als S3 |
| BO-40 | G | Confirm sessie → bevestiging naar klant → publieke `/afspraak/:token` accepteren | Sessie DEFINITIEF; klant kan accepteren/verzetten; iCal beschikbaar |

## Inspectieplan — beheer & review (R3)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-41 | G | Nieuw inspectieplan: relatie + normtype + inspecteur + reviewer · status draft | Aangemaakt; toewijzings-notificatie naar inspecteur |
| BO-42 | G | Scope: hoofdlocatie + deellocaties op AssetNode-boom; assets-tab toont boom | Correct; plattegrond-tab laadt (Konva) |
| BO-43 | A | Probeer plan te **submitten** vanuit draft (niet in_progress) | Geblokkeerd 400 "alleen plannen die in uitvoering zijn" |
| BO-44 | G | Neem een plan dat via PWA op `pending_review` staat → review → approve | pending_review → approved; notificatie naar inspecteur |
| BO-45 | A | Review → reject | Status reviewed (afgekeurd), niet terug naar in_progress |
| BO-46 | A | Met `inspectionReviewEnabled` aan: forceer plan naar completed zonder review | Geblokkeerd (vier-ogen-gate) |

## Documentgeneratie & ondertekening (R8)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-47 | G | Documenten-tab op approved plan → genereer rapport → preview | HTML-preview correct; injectie-data uit seed veilig geëscaped |
| BO-48 | G | Export PDF (Puppeteer) en Word | Bestanden downloadbaar, openen zonder fout, bevatten de juiste gegevens |
| BO-49 | G | Handtekening aanvragen → status PENDING_SIGNATURES | Signature-request aangemaakt (voor PUB-ondertekening) |
| BO-50 | F | Genereer document met een contact met extreem lange naam / emoji | Rendert zonder layout-breuk |
| BO-51 | A | Als INSPECTEUR de Documenten-genereer-actie proberen | Geen rechten (alleen-lezen op inspectiedomein) |

## Feature-gating per rol/plan

| ID | T | Stap | Verwacht |
|---|---|---|---|
| BO-52 | A | Log in bij `testbedrijf` (Basis-plan) als admin → zoek Offertes/Planning-compleet | Compleet-features afwezig/gegate, geen crash |
| BO-53 | A | Directe URL naar een gegate route (`/quotes`) in Basis-org | Feature-gate-scherm, geen data |
