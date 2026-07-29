# IMP_PRD_15 — Centraal herstellersportaal / partnerportaal (kort plan)

*Status: plan — 17 juli 2026, besluiten verwerkt. Uitvoeren ná afronding van IMP_PRD_14 (online herstel).*
*Afhankelijk van: `docs/IMP_PRD_14_Online-Herstel.md` (RepairSession-model, herstel-flow, entitlement `ONLINE_HERSTEL`).*

## 15.0 TL;DR

- **Probleem**: installateurs doen herstelwerk voor meerdere inspectiebedrijven (orgs). Per org een apart klantportaal-subdomein betekent voor hen versnipperde toegang zonder overzicht.
- **Oplossing**: één centraal **partnerportaal onder InspeXi-merk** (besluit 1) op een generiek subdomein (bijv. `herstel.inspexi.nl` / `herstel.localhost:5174`) met een overzicht van álle inspecties waar de hersteller herstelwerk voor doet — over organisaties heen — met doorklik naar de bestaande herstel-flow per inspectie.
- **Belangrijkste bevinding uit de codebase**: **`ClientUser` is al platform-globaal** — `email @unique` (globaal), géén `orgId` op het model; de org-binding loopt via `ClientAccess`/`InspectionClientAccess` en (na PRD-14) `RepairSession.orgId`. Er is dus **geen nieuw auth-realm nodig**: de hersteller ís een ClientUser met een nieuwe rol **`HERSTELLER`** (accounts kunnen meerdere rollen hebben, besluit 4).
- **Kern van de wijziging**: een vierde hostname-type **`portal`** in de `TenantMiddleware` (naast `superuser`/`org`/`unknown`). Op die host komt de org niet uit het subdomein maar **uit de resource** (`RepairSession.orgId` → plan → org), met entitlement-check per betrokken org.
- **Historie-koppeling**: CLIENT_USER-sessies hangen al aan het account; ANONYMOUS-sessies worden geclaimd via **geverifieerd e-mailadres**. Nieuw (besluit 3): **herstelopdrachten** — de org markeert *preferred partners*, de **opdrachtgever wijst de herstelopdracht toe** aan een installateur (org-toggle default uit; project-niveau erft van de org).
- **Verborgen opt-out** (besluit 2): `Organization.centralRepairPortalEnabled` bestaat in schema en query-logica (default `true`), maar wordt **nergens als instelling getoond** — beslissen we later.
- **Notificaties voor herstellers** (besluit 5): e-mail bij toegewezen werk + herinneringen bij niet-afgeronde sessies.
- **Zelfde frontend-app**: `apps/client-portal` krijgt een "centrale modus" (InspeXi-branding, org-branding alleen per kaart in het overzicht) — geen derde app.

## 15.1 Wat er al ligt (bevindingen)

| Bouwsteen | Status | Relevantie |
|---|---|---|
| `ClientUser` + `ClientRefreshToken` + magic links (`apps/api/prisma/schema.prisma`, `imp_client_users`) | Bestaat; e-mail globaal uniek, geen orgId, `emailVerified`-vlag aanwezig | Globale identiteit voor de hersteller — login/registratie/wachtwoord-reset volledig herbruikbaar |
| `TenantMiddleware.classifyHostname()` (`common/middleware/tenant.middleware.ts`) | 3 typen: `superuser` (`mijn.` + basisdomein), `org` (slug), `unknown` (IP/tests) | Uitbreiden met type `portal` (env `REPAIR_PORTAL_SUBDOMAIN=herstel`), incl. `TenantContext.isRepairPortalDomain` |
| `client-*`-API-modules | Org-scoped via subdomein + `assertInspectionAccess` | Blijven onveranderd voor het org-portaal; portal-host krijgt eigen scoping-pad |
| `RepairSession` (PRD-14) | Heeft `orgId`, `inspectionPlanId`, `accessType`, `email`, `clientUserId` | Dé ankertabel: "waar doe ik herstelwerk" = "waar heb ik sessies of opdrachten" |
| Cookies & CORS (`main.ts`) | Productie-cookie op `.inspexi.nl`; CORS staat alle subdomeinen van `BASE_DOMAIN` toe | Centraal subdomein werkt zonder infrastructuurwijziging |
| `apps/client-portal` `lib/tenant.ts` + `tenant-provider.tsx` | Haalt branding via `GET /organizations/by-slug/:slug` | Heeft een centrale modus nodig (portal-subdomein → geen by-slug-call) |

## 15.2 Ontwerp

### 15.2.1 Host, branding & tenancy

- Nieuw hostname-type `portal` in `classifyHostname()`; `TenantContext` krijgt `isRepairPortalDomain: boolean` (analoog aan `isSuperuserDomain`), `orgId: null`.
- **Branding (besluit 1)**: het portaal is een InspeXi-*partnerproduct* — vaste InspeXi-huisstijl, geen white-label van een org. Per inspectiekaart in het overzicht wél de org-identiteit (naam/logo/kleur) zodat de partner weet voor wélk inspectiebedrijf hij werkt.
- Op de portal-host geldt: **org-scoping per resource, niet per request**. De `RepairSessionGuard` (PRD-14) accepteert op deze host sessies van elke org en gebruikt `session.orgId` als scope; de `FeatureGuard`-check op `ONLINE_HERSTEL` verschuift voor deze routes naar de service-laag (per betrokken org via de entitlements-resolver).

### 15.2.2 Rollen (besluit 4)

```prisma
enum ClientUserRole {
  KLANT       // opdrachtgever-gebruiker (huidig gedrag)
  HERSTELLER  // partner/installateur
}

// ClientUser
roles ClientUserRole[] @default([KLANT])
```

- Meerdere rollen per account mogelijk (een installateur kan ook opdrachtgever zijn). Migratie zet bestaande accounts op `[KLANT]`.
- Registratie via het partnerportaal (of via een herstelopdracht-uitnodiging) voegt `HERSTELLER` toe; de rol stuurt de navigatie (partnerportaal-overzicht vs. klantportaal-weergave) en wie er in de partner-kieslijst verschijnt (§15.2.4).

### 15.2.3 Account & historie-koppeling

Een inspectie hoort bij "mijn herstelwerk" wanneer:

1. er een `RepairSession` met `clientUserId = ik` bestaat (CLIENT_USER-sessies, en ANONYMOUS-sessies die al geclaimd zijn);
2. er een ANONYMOUS-`RepairSession` bestaat met `email = mijn e-mail` **én** mijn account `emailVerified` is → bij login/registratie draait een idempotente claim-run die `clientUserId` invult;
3. er een **herstelopdracht** (`RepairAssignment`, §15.2.4) aan mij is toegewezen (geaccepteerd of nog open).

Instap vanuit PRD-14: na het ondertekenen van de herstelverklaring in een anonieme sessie toont het bevestigingsscherm een CTA naar registratie op het partnerportaal (e-mail is al bekend; verificatiemail = bestaand client-auth-mechanisme).

### 15.2.4 Herstelopdrachten & preferred partners (besluit 3)

De org markeert partners; **de opdrachtgever wijst toe** (in het klantportaal, bij zijn inspectie), mits de functie aan staat.

**Toggles** — twee niveaus:

```prisma
// Organization
repairAssignmentEnabled     Boolean @default(false) @map("repair_assignment_enabled")
centralRepairPortalEnabled  Boolean @default(true)  @map("central_repair_portal_enabled") // verborgen, besluit 2

// Project — null = erven van org
repairAssignmentEnabled Boolean? @map("repair_assignment_enabled")
```

Effectieve waarde per inspectieplan: `plan.project?.repairAssignmentEnabled ?? organization.repairAssignmentEnabled` (plan zonder project → org-instelling). Org-toggle zichtbaar in org-instellingen; project-toggle op de projectdetailpagina (drie standen: erven/aan/uit). `centralRepairPortalEnabled` krijgt **géén UI** — alleen schema + query-filter, zodat we later kunnen beslissen.

**Nieuwe modellen (schets):**

```prisma
// Partnerlijst per org; door staf beheerd (ORG_ADMIN/MANAGER)
model OrganizationRepairPartner {
  id           String   @id @default(uuid()) @db.Uuid
  orgId        String   @map("org_id") @db.Uuid
  clientUserId String   @map("client_user_id") @db.Uuid // account met rol HERSTELLER
  isPreferred  Boolean  @default(false) @map("is_preferred")
  notes        String?
  @@unique([orgId, clientUserId])
  @@map("imp_org_repair_partners")
}

enum RepairAssignmentStatus { UITGENODIGD GEACCEPTEERD AFGEWEZEN INGETROKKEN AFGEROND }

model RepairAssignment {
  id                     String  @id @default(uuid()) @db.Uuid
  orgId                  String  @map("org_id") @db.Uuid
  inspectionPlanId       String  @map("inspection_plan_id") @db.Uuid
  partnerClientUserId    String? @map("partner_client_user_id") @db.Uuid // null zolang alleen per e-mail uitgenodigd
  invitedEmail           String? @map("invited_email")
  assignedByClientUserId String? @map("assigned_by_client_user_id") @db.Uuid // de opdrachtgever
  status                 RepairAssignmentStatus @default(UITGENODIGD)
  message                String? // optionele toelichting van de opdrachtgever
  respondedAt            DateTime? @map("responded_at")
  createdAt              DateTime  @default(now()) @map("created_at")
  @@index([partnerClientUserId, status])
  @@map("imp_repair_assignments")
}
```

**Flow:**

1. Staf beheert de partnerlijst per org (bestaande partners zoeken op e-mail of uitnodigen); markeert er één of meer als *preferred*.
2. De opdrachtgever ziet op zijn inspectie (klantportaal, alleen bij effectief `repairAssignmentEnabled` + `onlineRepairEnabled`) de knop "Herstelopdracht toewijzen": kieslijst met de partners van de org (*preferred* bovenaan en als zodanig gelabeld), of een e-mailadres van een eigen installateur.
3. De partner krijgt een e-mail (bestaand account → link naar het portaal; geen account → uitnodiging tot registratie met rol HERSTELLER, waarna de assignment via het e-mailadres aan het account gekoppeld wordt — zelfde geverifieerd-e-mail-regel als §15.2.3).
4. Accepteren zet de inspectie in het partneroverzicht en opent desgewenst direct een `RepairSession`; afwijzen/intrekken meldt terug aan de opdrachtgever. Meerdere assignments per plan mogen (verschillende partijen voor verschillende constateringen — de first-wins-claim uit PRD-14 regelt de rest).
5. Een toewijzing is een *uitnodiging tot herstel*, geen exclusiviteit: de anonieme route (rapportnummer + postcode) blijft gewoon werken.

### 15.2.5 API

Nieuwe routes binnen `client-repair` (portal-host) en kleine uitbreidingen elders:

| Route | Methode | Auth | Doel |
|---|---|---|---|
| `/client/repair/portal/overview` | GET | `ClientJwtAuthGuard` (rol HERSTELLER) | Gekoppelde inspecties + open opdrachten, gegroepeerd per organisatie (orgnaam/logo/kleur mee), status per plan, filter op `centralRepairPortalEnabled` |
| `/client/repair/portal/inspections/:planId/session` | POST | idem | (Her)opent een CLIENT_USER-`RepairSession` voor een gekoppeld plan → token voor de bestaande herstel-flow |
| `/client/repair/portal/assignments/:id/respond` | POST | idem | `{ accept: boolean }` → GEACCEPTEERD/AFGEWEZEN + terugmelding |
| `/client/repair/assignments` (org-subdomein, klantportaal) | POST | `ClientJwtAuthGuard` (opdrachtgever) | Herstelopdracht aanmaken (partner-keuze of e-mail), alleen bij effectieve toggle |
| Staf: partnerlijst-CRUD onder `/repair-partners` | — | staf-rollen | Beheer `OrganizationRepairPartner` incl. preferred-vlag |

De volledige herstel-flow (`GET session`, claim, foto's, complete, sign) is daarna de **bestaande** PRD-14-flow op het sessietoken — de guard gebruikt op de portal-host `session.orgId` als scope i.p.v. het subdomein. De anonieme flow op org-subdomeinen verandert niet.

### 15.2.6 Frontend (`apps/client-portal`, centrale modus)

- `lib/tenant.ts`: portal-subdomein detecteren → `TenantProvider` slaat de by-slug-brandingcall over en gebruikt vaste InspeXi-branding; `tenantStorage`-prefix wordt `herstel`.
- Nieuwe pagina's: `/portaal` (overzicht: kaarten per organisatie met org-logo/kleur, open opdrachten bovenaan met accepteer/afwijs-acties, filters op status/organisatie) en doorklik naar de bestaande herstel-overzicht/modal/wizard-componenten (sessie-gedreven, werken ongewijzigd).
- Klantportaal (org-subdomein): sectie "Herstelopdracht" op de inspectie-detailpagina (partner-kieslijst + e-mailoptie, status van uitstaande opdrachten).
- Staf-portal: partnerlijst-beheer (org-instellingen of eigen pagina), org-toggle `repairAssignmentEnabled`, project-toggle (erven/aan/uit).
- Login/registratie: bestaande client-auth-schermen; registratie via het partnerportaal zet rol HERSTELLER.

### 15.2.7 Notificaties & e-mail voor herstellers (besluit 5)

Herstellers zitten in de client-realm (geen staf-`Notification`-systeem); v1 = **e-mail via Resend** + badges in het portaaloverzicht:

- Nieuwe herstelopdracht toegewezen (uitnodiging of bestaand account).
- Herinnering bij niet-afgeronde sessie (claims zonder ondertekende verklaring na X dagen; haakt in op PRD-14 §14.13 "herinnerings-e-mails") en bij onbeantwoorde opdracht na X dagen.
- Terugmeldingen richting opdrachtgever (geaccepteerd/afgewezen) via de bestaande klantportaal-e-mailpatronen; de staf-PM krijgt de bestaande PRD-14-notificaties.
- In-app notificatiecentrum voor de client-realm: buiten scope (later, generiek voor klant- én partnerportaal).

## 15.3 Beveiliging & privacy

- **Claim-by-email uitsluitend bij `emailVerified`** — anders is registratie met andermans e-mailadres een overname van diens herstelhistorie of opdrachten.
- Het portaal toont per inspectie **exact dezelfde gegevensset als de anonieme weergave** uit PRD-14 §14.11 — het centrale portaal voegt géén extra datavelden toe, alleen aggregatie. Opdrachtgever-contactgegevens blijven ook voor toegewezen partners verborgen (de opdrachtgever kan zijn gegevens desgewenst in het toelichtingsveld zetten).
- Cross-org-lek is het hoofdrisico: de overview-query filtert uitsluitend op de koppelregels uit §15.2.3; E2E-cases voor "hersteller ziet plan van org X niet zonder sessie/opdracht" zijn verplicht.
- Partner-kieslijst voor de opdrachtgever bevat alleen naam/bedrijf van partners van díe org (geen e-mailadressen lekken, geen platformbrede partnerlijst).
- `centralRepairPortalEnabled = false` verbergt alle inspecties van die org in het portaal (ook historisch); sessies en verklaringen blijven in de org-context bestaan.

## 15.4 Besluiten (17 juli 2026)

1. **Branding**: InspeXi-merk, gepositioneerd als *partnerportaal*; geen white-label per org.
2. **Org-opt-out**: wél inbouwen (`centralRepairPortalEnabled`, default `true`), **geen UI** — verborgen instelling, besluit over zichtbaarheid volgt later.
3. **Herstelopdrachten**: org markeert *preferred partners*; de **opdrachtgever** wijst de opdracht toe. Toggle op org-niveau (default uit) en project-niveau (default erven van org).
4. **Rollen**: aparte rol `HERSTELLER`; één account kan meerdere rollen hebben (`roles`-array op `ClientUser`).
5. **Notificaties herstellers**: ja — toegewezen werk + herinneringen (v1 per e-mail).

Resterende detailvragen (bij het oppakken): opdracht per plan of per constatering-subset (v1: per plan); wie in de staf de partnerlijst mag beheren (voorstel: ORG_ADMIN/MANAGER); herinner-intervallen; of een opdrachtgever meerdere partners tegelijk mag uitnodigen op één plan (voorstel: ja).

## 15.5 Fasering (indicatief)

| Fase | Inhoud | Migratie? |
|---|---|---|
| 1 | Host-type `portal` + env + `TenantContext` + guard-aanpassingen; `ClientUser.roles`; verborgen `centralRepairPortalEnabled` | ja |
| 2 | Historie-koppeling (claim-by-verified-email), portal-overview- en session-endpoint, CTA-hook in de PRD-14-bevestiging | nee |
| 3 | Herstelopdrachten: modellen (`OrganizationRepairPartner`, `RepairAssignment`), toggles org/project, opdrachtgever-flow (klantportaal) + partner-respond, e-mails | ja |
| 4 | Client-portal centrale modus: `/portaal`-overzicht, opdracht-acties, login/registratie met rol; staf-portal partnerbeheer + toggles | nee |
| 5 | Herinnerings-e-mails, E2E cross-org-isolatie + opdracht-flow, seed-demo, docs | nee |

Uitvoerbare Claude Code-prompts (APPLY-doc) schrijven we bij het oppakken, zelfde werkwijze als PRD-13/14 — dan zijn de PRD-14-modelnamen definitief.
