# Testlogboek SEC-A — cross-tenant, autorisatie & isolatie (SEC-01 t/m SEC-09)

Uitvoering: 2026-07-27, API `http://localhost:3001/api/v1` (`NODE_ENV=test`, throttle uit).
Tenant-resolutie via `Host`-header (`inspexidemo.localhost`, `testbedrijf.localhost`, `inspexicompleet.localhost`, `mijn.localhost`).
Alle regels hieronder komen uit daadwerkelijk uitgevoerde HTTP-calls; DB-controles via `psql` op `localhost:5433`.

**Gebruikte organisaties**
- org A = `inspexidemo` (plan Compleet, alle rollen aanwezig)
- org B = `testbedrijf` (plan Basis — géén `/quotes`, géén inspectieplan)
- org C = `inspexicompleet` (plan Compleet, wél een inspectieplan `INSP-2026-0001` en een gegenereerd document) — gebruikt als cross-tenant tegenpartij zodra org B het endpoint niet in zijn plan heeft

Formaat: `ID | PASS/FAIL/BLOCKED/SKIP | opmerking`

---

## SEC-01 — ORG_ADMIN op SUPERUSER-routes

| ID | Status | Opmerking |
|---|---|---|
| SEC-01a | PASS | HTTP 403 op `GET /organizations` met ORG_ADMIN-token (`"Forbidden resource"`) |
| SEC-01b | PASS | HTTP 403 op `GET /plans` met ORG_ADMIN-token |
| SEC-01c | PASS | HTTP 403 op `PATCH /organizations/:id/plan` met ORG_ADMIN-token (eigen org-id) |
| SEC-01-ctl | PASS | Positieve controle: SUPERUSER krijgt 200 op `/organizations` en `/plans` (op `mijn.localhost`) |

## SEC-02 — ORG_ADMIN op globale registries

| ID | Status | Opmerking |
|---|---|---|
| SEC-02a | PASS | `GET /classification-models` → 200 (lezen is bewust ALL_STAFF, `READ_ROLES = ALL_STAFF`) |
| SEC-02b | PASS | `GET /norm-types` → 200 |
| SEC-02c | PASS | `GET /measurement-sheet-templates` → 200 |
| SEC-02d | PASS | `GET /classification-models/admin` → 403 (schrijfrol vereist, `WRITE_ROLES = [SUPERUSER]`) |
| SEC-02e | PASS | `POST /norm-types` → 403 |
| SEC-02f | PASS | `POST /classification-models` → 403 |
| SEC-02g | PASS | `POST /measurement-sheet-templates` → 403 |

> **Afwijking t.o.v. de letterlijke tekst van SEC-02 in het testplan** ("Geen toegang (SUPERUSER-only)"): lézen van de globale registries is voor alle staf toegestaan en is expliciet zo geïmplementeerd (`const READ_ROLES = ALL_STAFF` in `classification-models.controller.ts`, idem norm-types/meetstaat-templates). Dat is functioneel nodig: de org-admin moet in de inspectie-config uit deze registries kunnen kiezen. Schrijven is wél SUPERUSER-only. Beoordeeld als **by design**, geen bevinding — testplan-tekst zou "lezen mag, schrijven niet" moeten zeggen.

## SEC-03 — INSPECTEUR op CRM

| ID | Status | Opmerking |
|---|---|---|
| SEC-03a | PASS | `GET /contacts` → 403 |
| SEC-03b | PASS | `GET /contacts/:id` → 403 |
| SEC-03c | PASS | `PATCH /contacts/:id` (companyName overschrijven) → 403; contact in DB onveranderd ("Bouwbedrijf De Vries BV") |
| SEC-03d | PASS | `POST /contacts` → 403; geen nieuw contact in DB (aantal org A bleef 3) |
| SEC-03e | PASS | `DELETE /contacts/:id` → 403; `is_deleted` bleef `false` |
| SEC-03f | PASS | `GET /quotes` → 403 |
| SEC-03g | PASS | `POST /quotes` → 403 |
| SEC-03h | PASS | `PUT /quotes/:id/lines` → 403; offerteregels onveranderd (5 regels) |

## SEC-04 — Goedkeuren door de verkeerde rol

| ID | Status | Opmerking |
|---|---|---|
| SEC-04a | PASS | BACKOFFICE `POST /quotes/:id/approve` → 403 (RolesGuard, MANAGEMENT_ROLES) |
| SEC-04b | PASS | BACKOFFICE `POST /quotes/:id/reject` → 403 |
| SEC-04c | PASS | BACKOFFICE approve op een offerte die écht in TER_GOEDKEURING staat → 403 |
| SEC-04d | PASS | **Tweede laag**: ORG_ADMIN approve op een MANAGER-gericht drempelverzoek → 403 met NL-melding `"U heeft niet de vereiste rol om dit verzoek goed te keuren"` |
| SEC-04e | PASS | Idem voor `reject` → zelfde 403 + zelfde NL-melding |
| SEC-04f | PASS | INSPECTEUR approve → 403 |
| SEC-04-ctl | PASS | Positieve controle: MANAGER approve → 201, offerte naar GOEDGEKEURD (bewijst dat de status vóór de controle nog TER_GOEDKEURING was, dus de geblokkeerde pogingen lieten de data ongemoeid) |

> Opzet: offerte OFF-2026-0003 aangemaakt (regel € 25.000 > drempel € 10.000, org A `quoteApprovalRequiredRole = MANAGER`), `submit-approval` → `QuoteApprovalRequest{kind: THRESHOLD, approverRole: MANAGER, status: PENDING}`. Testofferte na afloop volledig opgeruimd (approval-request, regels, offerte).

## SEC-05 — WERKVOORBEREIDER op org-instellingen

| ID | Status | Opmerking |
|---|---|---|
| SEC-05a | PASS | `GET /organizations/:id` (eigen org) → 403 |
| SEC-05b | PASS | `PATCH /organizations/:id` (naam wijzigen) → 403; org-naam in DB onveranderd |
| SEC-05c | PASS | `GET /users` → 403 |
| SEC-05d | SKIP | `POST /users` bestaat niet (404 `Cannot POST /api/v1/users`) — gebruikers worden via uitnodigingen aangemaakt; geen geldig testgeval |
| SEC-05e | PASS | BACKOFFICE `GET /organizations/:id` → 403 (ORG_ADMINS-only bevestigd) |
| SEC-05-ctl | PASS | Positieve controle: ORG_ADMIN `GET /organizations/:id` → 200 |

## SEC-06 — INSPECTEUR en documenten

| ID | Status | Opmerking |
|---|---|---|
| SEC-06a | PASS | `POST /generated-documents/:id/finalize` → 403 (APPROVERS-only) |
| SEC-06b | PASS | `GET /inspection-plans/:id/documents` → 200 (lezen is ALL_STAFF, by design) |
| SEC-06c | **FAIL** | `POST /generated-documents/:id/sign` met `signerRoleCode: "CLIENT"` → **201**; INSPECTEUR zet een geldige handtekening namens de opdrachtgever → **B-101** |
| SEC-06d | **FAIL** | idem met `signerRoleCode: "REVIEWER"` → **201** (vier-ogen-rol zelf ondertekend) → **B-101** |
| SEC-06e | **FAIL** | idem met niet-bestaande rolcode `"BESTAAT-NIET"` → **201**, geen validatie tegen `imp_signer_roles` → **B-101** |
| SEC-06f | **FAIL** | `POST /inspection-plans/:id/generate-plan` → **201**, INSPECTEUR genereert een document → **B-103** |
| SEC-06f2 | PASS (info) | `POST /inspection-plans/:id/generate-report` → 404 `"Document-template niet gevonden"` — géén autorisatiestop maar een ontbrekende RAPPORT-template in de seed; de rol kwam wél door de guard heen (zie B-103) |
| SEC-06g | **FAIL** | `DELETE /generated-documents/:id` → **200**; INSPECTEUR verwijdert een `PENDING_SIGNATURES`-document hard, inclusief de reeds geplaatste handtekeningen (cascade) → **B-102** |
| EXTRA-05 | **FAIL** | `PATCH /generated-documents/:id` met `editedContent` → **200**; INSPECTEUR herschrijft de inhoud van een al ondertekend document, handtekening blijft staan → **B-104** |
| EXTRA-03 | PASS | Cross-tenant: `GET /generated-documents/:id` van org C met org A-token → 403 `"Document hoort niet bij uw organisatie"` |
| EXTRA-04 | PASS | Cross-tenant: `POST .../sign` op org C-document met org A-INSPECTEUR → 403 (zelfde melding) |

> **Opruimen:** de door SEC-06g verwijderde seed-rij (PLAN-document `563400a1-…` van het demo-plan) is met psql hersteld: het door SEC-06f gegenereerde document heeft het oorspronkelijke id/`generated_at` overgenomen, status terug op `PENDING_SIGNATURES`, en de twee originele handtekeningrijen (INSPECTOR/Tom Visser SIGNED, CLIENT/Demo Klant PENDING) zijn opnieuw ingevoegd. De `editedContent` van EXTRA-05 is teruggedraaid (`is_edited=false`). Alle SEC-06-testhandtekeningen zijn verdwenen met de delete.

## SEC-07 — Cross-tenant read met org A-token (`Host: inspexidemo.localhost`)

| ID | Status | Opmerking |
|---|---|---|
| SEC-07a | **FAIL** | `GET /contacts/:id` (org B-contact) → **403** `"Forbidden"` i.p.v. de door het plan verwachte 404 → **B-105** |
| SEC-07b | PASS | `GET /inspection-plans/:id` (org C-plan) → 404 `"Inspectieplan niet gevonden"` (correcte existence-oracle) |
| SEC-07c | **FAIL** | `GET /users/:id` (org B-user) → **403** `"Forbidden"` → **B-105** |
| SEC-07d | **FAIL** | `GET /organizations/:id` (org B) → **403** `"Geen toegang tot deze organisatie"` → **B-105** |
| SEC-07h | **FAIL** | `GET /quotes/:id` (org C-offerte) → **403** `"Forbidden"` → **B-105** |
| SEC-07e/f/g/i | PASS | Referentiemeting met een niet-bestaande UUID: contacts/inspection-plans/users/quotes geven alle vier **404** — het verschil met de regels hierboven is precies het lek |
| SEC-07j | PASS (mét B-105) | `PATCH /quotes/:id` (org C) → 403; offerte in DB onveranderd |
| SEC-07k | PASS | `PATCH /contacts/:id` (org B) → 403; `company_name` onveranderd ("Installatie Groep Nederland") |
| SEC-07l | PASS | `DELETE /contacts/:id` (org B) → 403; `is_deleted` bleef `false` |
| SEC-07m | PASS | `PATCH /users/:id` (org B) → 403; `first_name` onveranderd ("Lisa") |
| SEC-07n | PASS | `GET /tasks/:id` (niet-bestaand) → 404 `"Taak niet gevonden"` |

> **Belangrijk:** in géén enkel cross-tenant geval kwam er data van de andere org terug. Het probleem is uitsluitend de statuscode/melding die het *bestaan* van een resource in een andere org bevestigt (B-105).

## SEC-08 — FK-injectie (org A-token, org B/C-UUID's in de body)

| ID | Status | Opmerking |
|---|---|---|
| SEC-08a | PASS | `POST /inspection-plans` met org B-`contactId` → 403 `"Relatie hoort niet bij uw organisatie"` |
| SEC-08b | PASS | `assignedTo` van org B → 403 `"Inspecteur hoort niet bij uw organisatie"` |
| SEC-08c | PASS | `reviewerId` van org B → 403 `"Reviewer hoort niet bij uw organisatie"` |
| SEC-08d | PASS | `locationId` van org B → 403 `"Hoofdlocatie hoort niet bij uw organisatie"` |
| SEC-08h | PASS (isolatie) | `scopeLocationIds` met een asset-node van org C → 404 `"Scope-locatie niet gevonden"`; scope-rij niet aangemaakt |
| SEC-08h2 | **FAIL** | Nacontrole legt een **partial write** bloot: ondanks de 404 blijft het inspectieplan zelf in de DB staan (`status = draft`). Reproduceerbaar, ook met een volstrekt onbestaande scope-UUID → 3 pogingen = 3 weesplannen → **B-107** |
| SEC-08i | PASS | `PATCH /inspection-plans/:id` met `assignedTo` van org B → 403 |
| SEC-08e | PASS | `POST /tasks` met `entityType: CONTACT` + org B-`entityId` → 403 `"Relatie hoort niet bij uw organisatie"` |
| SEC-08f | PASS | `POST /tasks` met org B-`assigneeId` → 403 `"Toegewezen gebruiker hoort niet bij uw organisatie"` |
| SEC-08g | PASS | `PUT /quotes/:id/lines` met org B-`productId` → 403 `"Een of meer producten horen niet bij uw organisatie"`; de 5 bestaande regels bleven ongewijzigd (geen gedeeltelijke schrijfactie) |
| SEC-08j | PASS | `POST /assets/:nodeId/findings` met org C-node + org A-plan → 404 `"Asset-node niet gevonden"` |
| SEC-08k | PASS | idem met node én plan van org C → 404 `"Inspectieplan niet gevonden"` |
| SEC-08-db | PASS | DB-verificatie isolatie: 0 inspectieplannen met `org_id <> contact.org_id`, 0 taken met kruis-org `entity_id`, 0 findings met `SEC08%`, 0 cross-org scope-rijen. Géén enkele kruis-koppeling ontstaan — de weesplannen uit SEC-08h2 bevatten uitsluitend eigen-org FK's |

## SEC-09 — TenantGuard & login-realm

| ID | Status | Opmerking |
|---|---|---|
| SEC-09a | PASS | Org A-token op `Host: testbedrijf.localhost` (`GET /contacts`) → 403 `"U heeft geen toegang tot deze organisatie"` |
| SEC-09b | PASS | Idem op `GET /auth/me` → 403 (zelfde NL-melding) |
| SEC-09c | PASS | Org A-token op `mijn.localhost` → 403 `"Gebruik het subdomein van uw organisatie om in te loggen"` |
| SEC-09d | PASS | Onbekend subdomein `bestaatnietxyz.localhost` mét token → 404 `"Organisatie 'bestaatnietxyz' niet gevonden"` |
| SEC-09e | PASS | Onbekend subdomein zonder token → dezelfde 404 (geen verschil auth/geen auth) |
| SEC-09f | PASS | Login `admin@inspexi-demo.nl` op `testbedrijf.localhost` → 401 `"Uw account hoort niet bij deze organisatie"` |
| SEC-09g | PASS | Login `admin@testbedrijf.nl` op `inspexidemo.localhost` → 401 (zelfde melding, symmetrisch) |
| SEC-09h | PASS | Login `admin@inspexi-demo.nl` op `mijn.localhost` → 401 `"Gebruik het subdomein van uw organisatie om in te loggen"` |
| SEC-09i | PASS (info) | Login `superuser@inspexi.nl` op `inspexidemo.localhost` → 200 — by design (SUPERUSER heeft geen `orgId` en mag elk subdomein) |

## Aanvullende observaties (buiten het script)

| ID | Status | Opmerking |
|---|---|---|
| EXTRA-01 | PASS (mét B-106) | Geen token → 401, melding `"Unauthorized"` (Engels) |
| EXTRA-02 | PASS (mét B-106) | Onzin-token → 401 `"Unauthorized"` |
| EXTRA-06 | — | **Géén enkele 500** in de volledige run (alle ~60 calls). Orakel "nooit 500" gehaald. |
| EXTRA-07 | — | Alle rol-403's uit de `RolesGuard` geven de Engelse Nest-default `"Forbidden resource"`; service-laag-403's zijn wél Nederlands → **B-106** |

---

## Telling

| Status | Aantal |
|---|---|
| PASS | 69 |
| FAIL | 11 |
| SKIP | 1 |
| BLOCKED | 0 |

**Bevindingen:**

| Nr | Severity | Titel |
|---|---|---|
| B-101 | S1 | INSPECTEUR kan ondertekenen namens élke rol (ook `CLIENT`/`REVIEWER`); `signerRoleCode` niet gevalideerd |
| B-102 | S1 | INSPECTEUR kan een deels ondertekend document hard verwijderen incl. handtekeningen |
| B-103 | S2 | Documentgeneratie staat open voor ALL_STAFF (ruimer dan SEC-06 aanneemt) |
| B-104 | S2 | Inhoud van een reeds ondertekend document blijft wijzigbaar; handtekening blijft geldig |
| B-105 | S3 | Cross-tenant existence-oracle: 403 i.p.v. 404 op contacts/quotes/users/organizations/documents |
| B-106 | S3 | Engelse foutmeldingen bij 401/403 (`Forbidden resource`, `Forbidden`, `Unauthorized`) |
| B-107 | S3 | Afgewezen `POST /inspection-plans` laat toch een plan achter (niet-atomaire create) |

**Testdata-hygiëne:** alle tijdens deze run aangemaakte objecten zijn opgeruimd (testofferte OFF-2026-0003 + regels + approval-request, offerte in `inspexicompleet`, 3 weesplannen uit B-107, alle SEC06-handtekeningen). De door B-102 verwijderde seed-rij (PLAN-document `563400a1-…` van het demo-plan) is hersteld inclusief de twee originele handtekeningen, en de `editedContent` van B-104 is teruggedraaid. Eindcontrole: document weer opvraagbaar via `GET /generated-documents/563400a1-…` → 200, en 0 resterende `SEC0*`-artefacten in de DB.
