# Logboek — Actor SUPERUSER (SU-01 t/m SU-18) & Actor ORG_ADMIN (OA-01 t/m OA-22)

**Uitvoering:** 2026-07-27, 12:15–14:30 · Portal `http://mijn.localhost:5173` en
`http://inspexidemo.localhost:5173` · API `:3001` (`NODE_ENV=test`) · DB `localhost:5433`
**Accounts:** `superuser@inspexi.nl` (SUPERUSER), `admin@inspexi-demo.nl` (ORG_ADMIN),
zijdelings `manager@inspexi-demo.nl` (MANAGER), `admin@inspexibasis.nl` / `admin@inspexicompleet.nl`
(ORG_ADMIN varianten-orgs), `admin@randorg.nl` (unicode-org).

**Telling:** **33 PASS · 6 FAIL · 0 BLOCKED · 1 SKIP** (SU: 15/3/0/0 — OA: 18/3/0/1)
**Nieuwe bevindingen:** **B-501 t/m B-511** (11 stuks: 4× S2, 5× S3, 2× S4-bundel/cosmetisch)

> **Tooling-kanttekeningen** (géén applicatiebevindingen):
> - `read_page` geeft in deze omgeving een lege accessibility-tree; er is gewerkt met screenshots +
>   coördinaatklikken, `get_page_text` en `javascript_tool`.
> - De hover-`ActionMenu` achter de `>`-chevron (o.a. "Nieuwe organisatie", "Uitnodigen") sluit op
>   `mouseleave` tussen twee tool-calls door; die twee menu-items zijn met een DOM-`click()` geopend.
>   Alle overige interacties zijn met echte muisklikken/toetsaanslagen gedaan.
> - Screenshots en uploadtests (OA-02/03/04) en de "verse browsercontext" voor OA-10/11/14/15 zijn met
>   een losse headless-Chrome (puppeteer uit `apps/api/node_modules`) uitgevoerd.
> - Toasts verschijnen rechtsonder en verdwijnen snel; ze zijn met een `MutationObserver` vastgelegd
>   (zie B-511 §11).

---

## SUPERUSER — Onboarding: organisatie aanmaken

| ID | Resultaat | Waarneming |
|---|---|---|
| SU-01 | **PASS** | Org "Nieuwe Klant BV" / `nieuweklant` aangemaakt (VAT 21, geldigheid 30, logoUrl `https://example.com/logo.png`), verschijnt in de lijst en `http://nieuweklant.localhost:5173` toont het login-scherm mét org-branding ("Nieuwe Klant BV"). Kanttekening: de kleurkiezer is een native `input[type=color]` en is in deze omgeving alleen via een DOM-event te zetten. Vervolgstap onmogelijk: de org kan geen eerste gebruiker krijgen → **B-504**. |
| SU-02 | **PASS** | Slug van 1 teken (`a`, org "SU02 Kort") wordt geaccepteerd — de regex `^[a-z0-9]+$` staat het toe — en werkt ook echt: `http://a.localhost:5173` toont de branding "SU02 Kort". Wenselijk of niet is een productbeslissing; het echte risico zit in het *ontbreken* van reserved-/lengteregels → **B-505**. |
| SU-03 | **PASS** | Slug `nieuwe-klant` → live veldfout **"Slug mag alleen kleine letters en cijfers bevatten"**, geen submit (geen request in Network). Backend geeft dezelfde NL-melding (400). |
| SU-04 | **PASS** | `NieuweKlant`, `nieuwe klant` en `klant🔧` alle drie geweigerd met dezelfde NL-veldmelding, direct tijdens het typen. |
| SU-05 | **PASS** | Naam leeg → "Naam moet minimaal 2 tekens bevatten" + "Slug is verplicht"; naam `A` → zelfde naam-melding. Backend: `{"name":"X"}` → 400 (melding wel Engels → B-501). |
| SU-06 | **PASS** | Dubbele slug `inspexidemo` → `POST /organizations` **409** `{"message":"Slug is al in gebruik"}` + rode toast met diezelfde NL-tekst. Geen 500, formulier blijft ingevuld staan. |
| SU-07 | **FAIL** | Grenzen wórden afgedwongen (frontend én backend: VAT 0–100, geldigheid ≥ 1, niets opgeslagen), maar de meldingen zijn **Engels**: "Number must be greater than or equal to 0", "Number must be less than or equal to 100", "Number must be greater than or equal to 1"; backend idem (`defaultVat must not be less than 0`). Orakel eist NL. → **B-501** |
| SU-08 | **PASS** | Zoals in het script voorzien: frontend weigert `niet-een-url` met **"Ongeldige URL"** (NL), backend accepteert het (`logoUrl` is enkel `@IsString()`) → `POST /organizations {"logoUrl":"niet-een-url"}` = **201**. Laagverschil gedocumenteerd → **B-511 §5**. |
| SU-09 | **PASS** | Org aangemaakt met naam `<script>alert('SU09')</script> Ünïcode 试验 🔧 <b>vet</b>` (slug `su09xss`). Overal als **tekst** weergegeven: lijst-`innerHTML` bevat `&lt;script&gt;`, 0 `<script>`- en 0 `<b>`-nodes, geen alert. Idem voor de geseede `randorg`-gebruikers: `Piet <b>Piet</b>` en de 100-tekens-voornaam tonen veilig in lijst én detailpagina (0 `<b>`-nodes, geen dialog, geen horizontale overflow). Screenshot: `img/SU-09-randorg-escaping.png`. |

## SUPERUSER — Abonnement / entitlements

| ID | Resultaat | Waarneming |
|---|---|---|
| SU-10 | **PASS** | Plan **Compleet** toegekend aan `nieuweklant` (tab Abonnement → Opslaan): alle features springen op "Actief · in abonnement", `plan_id` staat in de DB. De sidebar-controle kon niet op déze org (geen gebruiker, zie **B-504**) en is daarom op `inspexicompleet` (plan Compleet) gedaan: BACKOFFICE (Relaties/Aanvragen/Offertes/Documenten) + UITVOERING (Projecten/Planning) + INSPECTIES (Inspecties/Assets/Meetmiddelen/Inspecteurs) zichtbaar. Screenshot: `img/SU-10-sidebar-compleet.png`. **Afwijking van het script gelogd.** |
| SU-11 | **PASS** | Op `inspexibasis` (plan Basis) toont de sidebar alleen Relaties + Projecten + INSPECTIES; Aanvragen/Offertes/Documenten/Planning ontbreken. Directe navigatie naar `/quotes` geeft de nette NL feature-gate **"Geen toegang — Deze functie zit niet in uw abonnement."**, geen crash, geen JS-fout. Screenshots: `img/SU-11-sidebar-basis.png`, `img/SU-11-featuregate-quotes.png`. |
| SU-12 | **PASS** | Uitgevoerd op de zelf aangemaakte org `su07test` (nooit op inspexidemo/testbedrijf/randorg). `PATCH {"isActive":false}` → middleware geeft op dat subdomein **404 "Organisatie 'su07test' niet gevonden"** voor zowel `by-slug` als `POST /auth/login`; geen data zichtbaar. De portal toont daar wel een generiek login-scherm zonder uitleg. **Org daarna weer op `isActive=true` gezet** (geverifieerd). Er is geen UI voor deze actie → **B-511 §1**. |

## SUPERUSER — Org-switcher & isolatie

| ID | Resultaat | Waarneming |
|---|---|---|
| SU-13 | **PASS** | Org-switcher → "Test Bedrijf" doet een full-page redirect naar `http://testbedrijf.localhost:5173`. In dev is opnieuw inloggen nodig omdat de refresh-cookie per subdomein is geïsoleerd (bewust; in productie `.inspexi.nl` gedeeld) — geen bevinding. Bij de eerste poging kwam de branding niet door (429 van de enumeratie-guard, zie **B-511 §3**); na afloop van de blokkade toont de pagina correct "Test Bedrijf". |
| SU-14 | **FAIL** | Geen scoping per subdomein voor de SUPERUSER. Op `nieuweklant.localhost` (org met **0** gebruikers) toont "Gebruikers — beheer de gebruikers van uw organisatie" **19** gebruikers uit 6 orgs; `GET /contacts` op datzelfde subdomein geeft relaties van `inspexidemo`. Op `testbedrijf.localhost` staan de relaties van 5 organisaties door elkaar zonder org-kolom. Aanmaken op een org-subdomein loopt bovendien op een **HTTP 500** uit. → **B-502** en **B-503**. Screenshots: `img/B-502-superuser-org-subdomein-alle-users.png`, `img/B-502-superuser-testbedrijf-contacten.png`. |

## SUPERUSER — Inspectie-systeem (globaal)

| ID | Resultaat | Waarneming |
|---|---|---|
| SU-15 | **PASS** | Classificatiemodel `SU15_TEST` + kenmerk `SU15_RISICO` ("Risicoklasse") + optie `SU15_KRITIEK` met **Kritiek** aangevinkt. DB: `is_critical = t`. Leeg submitten gaf eerst "Code is verplicht" / "Naam is verplicht" (NL). Het model is org-overstijgend beschikbaar: `GET /classification-models` als ORG_ADMIN van inspexidemo geeft `['NEN1010_DEFAULT','SCOPE8_DEFAULT','SU15_TEST']`. |
| SU-16 | **PASS** | Normtype `SU16_NORM` ("SU16 Testnorm") aangemaakt met asset-types `pomp, leiding` en gekoppeld classificatiemodel `SU15 Testclassificatie`. Koppelbaarheid geverifieerd: het normtype is selecteerbaar in zowel de meetstaat-template-wizard als het checklist-formulier. |
| SU-17 | **PASS** | Meetstaat-template `MS-SU17-TEST` (normtype SU16_NORM, asset-type `pomp`) → form-builder: sectie `algemeen` + numeriek veld `isolatieweerstand` met **decimalen 2, min 0, max 100** en pass/fail-regel `≥ 1` met foutmelding "Isolatieweerstand te laag". DB: `decimals=2, min=0, max=100, pass_fail_enabled=t, operator=GTE, value=1`. Template gepubliceerd (Concept → **Actief**, v1.0). |
| SU-18 | **FAIL** | Veld `su18_omgekeerd` met **min 100 / max 0** wordt zonder enige waarschuwing opgeslagen (`min_value=100, max_value=0`) én het template is daarna gewoon te **publiceren**. Geen cross-field-validatie in de builder, het DTO of de publish-actie. Elke waarde in dat veld is per definitie ongeldig → onbruikbaar template in de PWA (versterkt B-215). → **B-506**. Screenshot: `img/B-506-meetstaat-min-groter-dan-max.png`. |

**Autorisatie-kruisverwijzing (SEC-01..05):** als ORG_ADMIN geven alle mutaties op de SUPERUSER-registers
**403**: `POST /organizations`, `POST /classification-models`, `POST /norm-types`,
`POST /measurement-sheet-templates`, `GET|POST /plans`, `GET /organizations`. De **GET**'s op
`/classification-models`, `/norm-types` en `/measurement-sheet-templates` geven bewust **200** — dat zijn
globale, niet-tenantgebonden registers die de org-configuratie (checklists, constateringen) nodig heeft;
geen org-data in de respons. UI-kant: ORG_ADMIN ziet "Organisaties", "Abonnementen" en
"Inspectie-systeem" niet in de sidebar, maar de routes zijn wél bereikbaar → **B-509**.

---

## ORG_ADMIN — Organisatie-instellingen

| ID | Resultaat | Waarneming |
|---|---|---|
| OA-01 | **PASS** | Naam → "InspeXi Demo OA01", primaire kleur → `#c2410c`, BTW 21→9, geldigheid 30→14. Alles persistent in de DB en na `F5`; het portal-thema kleurt direct oranje (sidebar-titel, `+ Nieuw`-knop). Alle vier waarden zijn aan het eind teruggezet — zie **Herstel** onderaan. |
| OA-02 | **PASS** | PNG (20 kB) geüpload: `POST /organizations/:id/logo` → **201**, toast "Logo geüpload", logo direct zichtbaar in de instellingen-preview en via `GET …/logo` (200) op de login-pagina. |
| OA-03 | **PASS** | 4,9 MB PNG → geaccepteerd (201). 6 MB PNG → client-side geweigerd met NL-melding **"Bestand mag maximaal 5 MB zijn"**; backend dekt hetzelfde af (multer-limiet → **413**, melding "File too large" is Engels, zie B-501-familie). Geen crash. |
| OA-04 | **FAIL** | UI-kant klopt: `.txt` en `.pdf` → **"Alleen PNG, JPEG, SVG en WebP zijn toegestaan"** (NL), geen upload. Maar de API vertrouwt het door de client opgegeven MIME-type: een tekstbestand hernoemd naar `.png` met `type=image/png` wordt **201** geaccepteerd, en een SVG met `<script>` wordt opgeslagen én via de publieke `GET /organizations/:id/logo` met `Content-Type: image/svg+xml` teruggegeven — bij directe navigatie voert die JS uit op `inspexidemo.localhost` (**stored XSS**, `alert: OA02-XSS:inspexidemo.localhost` in headless Chrome). → **B-507** |
| OA-05 | **FAIL** | `0` en `null` worden door de API beide geaccepteerd (200) en negatief wordt geweigerd (400). Maar in de UI zijn ze niet te onderscheiden — een `NULL`-drempel toont als `0` — én elk tabblad stuurt bij Opslaan het **complete** org-object met `quoteApprovalThreshold: 0`. Een `NULL`-drempel wordt daardoor stil `0` zodra iemand een willekeurige andere instelling opslaat: vanaf dan vereist élke offerte boven € 0 goedkeuring. → **B-508** |
| OA-06 | **PASS** | 2001 tekens → **400** (grens correct), 2000 tekens → **200** en opgeslagen. Melding is Engels ("aiReviewInstructions must be shorter than or equal to 2000 characters") → B-501. Veld daarna weer leeggemaakt. |
| OA-07 | **PASS** | `inspectionReviewEnabled` en `onlineRepairDefault` via de Inspecties-tab uit- en weer aangezet; beide persistent in de DB en zichtbaar in de publieke by-slug-branding (`inspectionReviewEnabled:false` → `true`), waarop de portal zijn UI baseert. `chatEnabled` staat op de Huisstijl-/org-tab en bleef `true`. `aiReviewEnabled` is niet omzetbaar zolang de AI-dienst niet geconfigureerd is (checkbox disabled, waarde blijft staan). |
| OA-08 | **SKIP** | **Inhoudelijk deel niet testbaar:** er is geen `ANTHROPIC_API_KEY`, `GET /ai-review/status` geeft `{"available":false}` en de run-endpoints geven 503 — een AI-voorcontrole kon dus niet uitgevoerd of beoordeeld worden. Wat wél is vastgesteld: de UI belooft niets valselijk (op een org zónder entitlement staan de AI- en online-herstel-checkboxen disabled met "Niet beschikbaar in uw abonnement", en op inspexidemo staat de AI-checkbox disabled met "AI-dienst niet geconfigureerd"). De **API** kent die gate echter niet: `PATCH {"aiReviewEnabled":true}` op de Basis-org `inspexibasis` geeft **200** en bewaart de vlag → **B-510** (vlag daarna teruggezet op `false`). |

## ORG_ADMIN — Gebruikersbeheer & uitnodigingen

| ID | Resultaat | Waarneming |
|---|---|---|
| OA-09 | **PASS** | `oa09-nieuw@inspexi-demo.nl` uitgenodigd als INSPECTEUR. `imp_invitations`-rij aangemaakt met token, `expires_at` = +7 dagen, juiste `org_id`, `accepted_at` NULL. (E-mailverzending zelf valt buiten scope — geen Resend-key in dev.) |
| OA-10 | **PASS** | In een verse browsercontext `/invite/<token>` geopend, voornaam/achternaam + wachtwoord `Wachtwoord123!` ingevuld → `POST /users/accept-invitation` **201**, melding "Account aangemaakt!" en redirect naar de loginpagina. DB: user actief met rol `{INSPECTEUR}`, uitnodiging `accepted_at` gevuld. Screenshot: `img/OA-10-uitnodiging-geaccepteerd.png`. |
| OA-11 | **PASS** | Wachtwoord van 7 tekens (`Abc123!`) → frontend blokkeert met **"Wachtwoord moet minimaal 8 tekens bevatten"** (NL, bij het veld, geen request). Backend dekt hetzelfde af: `POST /users/accept-invitation` met 7 tekens → **400** (`password must be longer than or equal to 8 characters`, Engels → B-501). Token blijft daarbij ongebruikt. Screenshot: `img/OA-11-wachtwoord-7-tekens.png`. |
| OA-12 | **PASS** | `manager@inspexi-demo.nl` uitnodigen → **409 "Er bestaat al een gebruiker met dit e-mailadres"**. Ook een tweede openstaande uitnodiging voor hetzelfde adres → **409 "Er staat al een actieve uitnodiging open voor dit e-mailadres"**. Geen 500. |
| OA-13 | **PASS** | `admin@testbedrijf.nl` (andere org) → **409**, zelfde NL-melding. Kanttekening: die melding bevestigt daarmee het bestaan van een account in een andere organisatie → **B-511 §8**. |
| OA-14 | **PASS** | Geseede, op 2026-07-24 verlopen uitnodiging (`nieuw@inspexi-demo.nl`) gebruikt — geen DB-manipulatie nodig. Accepteren → **400 "Uitnodiging is verlopen"** (NL). Screenshot: `img/OA-14-verlopen-token.png`. |
| OA-15 | **PASS** | Token van OA-10 een tweede keer gebruikt → **400 "Uitnodiging is al geaccepteerd"** (NL), geen tweede account. Onbekend token en niet-UUID-token → **400 "Ongeldige uitnodiging"** (geen verschil tussen die twee, dus geen enumeratie-oracle). Screenshot: `img/OA-15-token-2e-keer.png`. Kanttekening: het formulier moet eerst volledig ingevuld worden voordat deze melding komt → **B-511 §7**. |
| OA-16 | **PASS** | `roles: []` → **400** `roles must contain at least 1 elements`; onbekende rol `BAAS` → 400 met de enum-opsomming; `SUPERUSER` toekennen → **403 "Alleen een superuser kan de superuser rol toewijzen"** (NL); eigen rol wijzigen → **403 "Je kunt je eigen rol niet wijzigen"** (NL). Geldige wijziging naar `[MANAGER, INSPECTEUR]` → 200 "Rol gewijzigd". |
| OA-17 | **PASS** | Uitgevoerd op de zelf uitgenodigde `oa09-nieuw@inspexi-demo.nl` (nooit op admin/manager/backoffice/werkvoorbereider/inspecteur). Deactiveren via Instellingen → gevarenzone; inloggen daarna → **401 "Account is gedeactiveerd"** (NL). Gebruiker aansluitend weer **geactiveerd** (`is_active = t`, geverifieerd). Twee kanttekeningen: deactiveren vraagt geen bevestiging (**B-511 §9**) en de melding komt vóór de wachtwoordcontrole (**B-511 §4**). |
| OA-18 | **FAIL** | Backend correct: alle SUPERUSER-mutaties én `GET /organizations` en `GET /plans` geven **403**. Maar de portal-routes zijn niet rol-gated: `/organizations`, `/plans` en `/classification-models` renderen voor een ORG_ADMIN gewoon en tonen "Fout bij het laden van organisaties: **Forbidden resource**" — een Engelse framework-melding in een NL-UI (B-106) in plaats van een nette toegangspagina. Erger nog bij MANAGER: `/organization/settings` toont een **leeg maar bewerkbaar** formulier na een 403 (de PATCH wordt wél geweigerd). → **B-509** |

## ORG_ADMIN — Inspectie-config (per org)

| ID | Resultaat | Waarneming |
|---|---|---|
| OA-19 | **PASS** | Asset-type `oa19pomp` / "OA19 Pompinstallatie" met **shortCode `POMP`** en normtype `SU16_NORM`; velden: `serienummer` (tekst) en `vermogen` (getal, `validation_rules {"min":0,"max":500}`). Typecode-koppeling geverifieerd: een nieuwe AssetNode met `typeCode: "oa19pomp"` krijgt server-side `nodeNumber` **`POMP-0044`** (patroon `[typecode]-####`). Testnode daarna via `DELETE /asset-nodes/:id` opgeruimd (soft delete: `deleted_at` gezet, node niet meer zichtbaar in de boom). Kanttekening: `oa19_pomp` werd geweigerd ("alleen kleine letters en cijfers") terwijl de systeemtypes juist `electrical_installation` heten → **B-511 §6**. |
| OA-20 | **PASS** | Checklist `CL-OA20` / "OA20 Pompchecklist" aangemaakt (normtype SU16_NORM, asset-type `oa19pomp`), 2 items uit de bibliotheek toegevoegd (NEN 1010 art. 462 en art. 411, beide **Verplicht**), Preview toont ze correct, daarna **gepubliceerd** → status **ACTIEF** v1.0 en zichtbaar via `GET /checklists`. |
| OA-21 | **PASS** | Constatering-template `OA21-LEK` met classificatiemodel **SU15 Testclassificatie**, standaardclassificatie **Kritiek (SU15)** (de `isCritical`-optie uit SU-15), normreferentie "NEN 1010 art. 462", toelichting en uitleg. Alles zichtbaar op de detailpagina. Kanttekening: er is geen apart "aanbeveling"-veld → **B-511 §10**. |
| OA-22 | **PASS** | Checklist met **0 items** publiceren → geweigerd met **"Een checklist zonder items kan niet gepubliceerd worden"** (NL, geen statuswijziging). Constatering-template zonder naam → **"Omschrijving is verplicht"** (NL, bij het veld). |

---

## Bevindingen uit deze run

| ID | Sev | Titel |
|---|---|---|
| **B-502** | S2 | SUPERUSER op een org-subdomein krijgt platform-brede data (geen tenant-scoping) |
| **B-503** | S2 | HTTP 500 zodra een SUPERUSER op een org-subdomein een record aanmaakt |
| **B-504** | S2 | Nieuw aangemaakte organisatie kan geen eerste gebruiker krijgen (onboarding loopt dood) |
| **B-507** | S2 | Logo-upload vertrouwt het MIME-type; SVG-logo met `<script>` = stored XSS op het portal-origin |
| **B-508** | S2 | Elk instellingen-tabblad slaat de héle org op; lege goedkeuringsdrempel wordt stil `0` |
| **B-501** | S3 | Grens-/validatiemeldingen in org-onboarding en -instellingen zijn Engels (zod + DTO) |
| **B-505** | S3 | Geen gereserveerde-slug- of lengtecontrole (`mijn`, 120 tekens) → onbereikbare organisatie |
| **B-506** | S3 | Meetstaat-veld met min > max wordt geaccepteerd én gepubliceerd |
| **B-509** | S3 | Portal-routes niet rol-gated (leeg org-formulier voor MANAGER, "Forbidden resource" voor ORG_ADMIN) |
| **B-510** | S3 | `aiReviewEnabled`/`onlineRepairDefault` via API aan te zetten zonder entitlement |
| **B-511** | S4 | Bundel: offboarding-UI, slug via API, enumeratie-guard-collateral, account-oracle, `logoUrl`, asset-type-regex, invite-token-timing, e-mail-oracle, confirm-dialoog, aanbevelingsveld, toast-feedback |

Verwezen naar bestaande bevindingen: **B-001** (dashboard-KPI's `--`, opnieuw waargenomen op elk
dashboard), **B-105/B-106** (403-vs-404, Engelse RolesGuard-meldingen), **B-153** (`/auth/refresh` zonder
cookie → 200), **B-155/B-302** (Engelse meldingen elders), **B-215** (min/max blokkeert PWA-invoer stil),
**B-301** (lange namen blazen tabelkolommen op — de gebruikerslijst heeft dit probleem **niet**, daar
blijft de tabel binnen de container). **B-305** (`limit=200` → 400) is in geen enkel SU/OA-scherm
opgetreden; de dropdowns in deze flows (normtypes, classificatiemodellen, abonnementen, rollen, asset-types)
werden alle correct gevuld.

---

## Testdata die deze run heeft achtergelaten

**Bewust laten staan** (nieuwe records, geen wijziging van bestaande seed-data):

| Wat | Waar | Reden |
|---|---|---|
| Org `nieuweklant` — "Nieuwe Klant BV", plan **Compleet**, 0 gebruikers | superuser-domein | Bewijs SU-01/SU-10 + B-504 |
| Org `a` — "SU02 Kort" | superuser-domein | Bewijs SU-02 |
| Org `su09xss` — naam met `<script>`/emoji/CJK | superuser-domein | Bewijs SU-09 (escaping) |
| Org `su07test` — "SU07 Grenswaarden", **weer actief** | superuser-domein | Gebruikt voor SU-12; hernoemd zodat hij niet met `nieuweklant` te verwarren is |
| Classificatiemodel `SU15_TEST` + kenmerk + kritieke optie | globaal | SU-15 |
| Normtype `SU16_NORM` | globaal | SU-16 |
| Meetstaat-template `MS-SU17-TEST` (**Actief**, bevat het foute veld uit SU-18) | globaal | SU-17/SU-18 — laat staan als levend bewijs voor B-506 |
| Asset-type `oa19pomp`, checklist `CL-OA20` (Actief), constatering-template `OA21-LEK` | inspexidemo | OA-19/20/21 |
| Gebruiker `oa09-nieuw@inspexi-demo.nl` (OA10 Nieuweling, MANAGER+INSPECTEUR, **actief**) | inspexidemo | OA-09/10/16/17 |
| Openstaande uitnodiging `oa12-dubbel@inspexi-demo.nl` | inspexidemo | OA-12 (dubbele-uitnodiging-test) |

> Let op voor volgende testers: het globale meetstaat-template `MS-SU17-TEST` is **Actief** en bevat
> bewust een onbruikbaar veld (`su18_omgekeerd`, min 100 / max 0). Het is org-overstijgend zichtbaar.

**Opgeruimd:** de via de API aangemaakte wegwerp-orgs `mijn`, `su08backend` en de 120-tekens-slug zijn
uit de database verwijderd; de test-AssetNode "OA19 Testpomp" (`POMP-0044`) is via de API verwijderd en
staat soft-deleted (`deleted_at` gevuld) in `imp_asset_nodes`; het XSS-testlogo is van
inspexidemo verwijderd; de AI-vlag van `inspexibasis` staat weer op `false`.

---

## Herstel van `inspexidemo` (afsluiting, verplicht onderdeel)

Alle in OA-01..OA-08 gewijzigde instellingen zijn teruggezet en met psql geverifieerd:

```
name                         | InspeXi Demo                 (was: InspeXi Demo OA01)
primary_color                | #1e40af                      (was: #c2410c)
default_vat                  | 21                           (was: 9)
default_validity_days        | 30                           (was: 14)
quote_approval_threshold     | 10000.00                     (was: NULL/0 na B-508)
quote_approval_required_role | MANAGER                      (ongewijzigd)
inspection_review_enabled    | t                            (was tijdelijk f — OA-07)
online_repair_default        | t                            (was tijdelijk f — OA-07)
ai_review_enabled            | t                            (ongewijzigd)
ai_review_instructions       | (leeg)                       (was tijdelijk 2000× 'y' — OA-06)
chat_enabled                 | t                            (ongewijzigd)
logo_url                     | (leeg)                       (testlogo's verwijderd — OA-02/03/04/B-507)
is_active                    | t                            (ongewijzigd)
inspector_*                  | ongewijzigd
```

**Twee bewuste afwijkingen van de oorspronkelijke waarden:**
1. `primary_color` staat nu als `#1e40af` (kleine letters) in plaats van `#1E40AF` — dezelfde kleur, de
   native kleurkiezer normaliseert de hex naar lowercase.
2. `quote_approval_threshold` is via het formulier weer op `10000` gezet; de tussentijdse `NULL`-toestand
   is niet meer via de UI in te stellen (zie **B-508**).

Verder is **`inspecteur2@inspexi-demo.nl` niet aangeraakt** (voor OA-17 is een zelf uitgenodigde
gebruiker gebruikt), en zijn `inspexidemo`, `testbedrijf` en `randorg` nooit op inactief gezet.
