# IMP PRD 09 — SaaS Abonnementen & Feature-Flags

> Status: **Concept ter review** · Auteur: Claude (Cowork) · Datum: 2026-06-22
> Taal: PRD in het Nederlands, feature-keys/code/branchnamen in het Engels (conform CLAUDE.md).
> Doel van dit document: één hand-off voor Claude Code om de abonnementen-/feature-flag-laag gefaseerd te bouwen.

## 0. Samenvatting

We bieden InspeXi Beheer aan als SaaS met **abonnementsvormen** (plannen). Per plan staan bepaalde **functies** (groepen van modules/modellen) aan of uit. Het abonnement is **org-gericht** (niet per gebruiker). Een organisatie kan haar eigen functies niet wijzigen; alleen een **SUPERUSER** kan plannen aanmaken én per organisatie functies bij- of afschakelen bovenop het plan. Het plan is dus een **template**; de effectieve set functies van een org = plan-defaults ⊕ per-org-overrides ⊕ automatische afhankelijkheden.

Roept een gebruiker een route/endpoint aan die niet in het abonnement zit, dan:
- **Frontend**: toont een nette pagina *"Deze functie zit niet in uw abonnement. Neem contact op met uw beheerder."*
- **Backend**: weigert met `403 FEATURE_NOT_IN_PLAN` (anders is de API alsnog open).

Dit document bevat: (1) de feature-catalogus + schematisch overzicht **Basis vs Compleet**, (2) een **cross-check** tegen de huidige routing/endpoints met een lijst van nog te beslissen items, (3) een **haalbaarheidsanalyse** van de Basis-workflow, (4) **datamodel & enforcement-architectuur**, (5) een **gefaseerd implementatieplan** met acceptatiecriteria, en (6) het **seed-plan** met testscenario's voor 2 organisaties.

### Beslissingen uit intake (2026-06-22)
1. **"Reminders" = notificaties.** Basis Workflow = notities + favorieten + notificaties (bestaande modules). Er hoeft géén nieuw reminder-model gebouwd te worden.
2. **Onafhankelijke toggles + automatische afhankelijkheden.** Elke functie is los aan/uit te zetten; het systeem dwingt afhankelijkheden af (bijv. Inspecties aan ⇒ Basis CRM verplicht aan).
3. **Producten, productgroepen en prijstabellen horen alleen bij CRM Compleet** (niet bij Uitvoering Compleet). Dit wijkt bewust af van de eerste schets.

---

## 1. Feature-catalogus

Functies zijn **groepen** van modules/modellen die elkaar nodig hebben. De keys zijn de bron-van-waarheid (in code, zie §4). `→ vereist` = automatische afhankelijkheid (dependency closure).

| Feature-key | Label (NL) | Bevat | → vereist |
|---|---|---|---|
| `BASIS_CRM` | Basis CRM | Relaties, Contactpersonen, Locaties | — |
| `CRM_COMPLEET` | CRM Compleet | Aanvragen, Offertes (+ sjablonen), Klantgroepen, **Producten/Productgroepen/Prijstabellen**, e-mailsjablonen | `BASIS_CRM` |
| `BASIS_UITVOERING` | Basis Uitvoering | Projecten (incl. volgers) | `BASIS_CRM` |
| `UITVOERING_COMPLEET` | Uitvoering Compleet | Planning, Werkbonnen, iCal-feed | `BASIS_UITVOERING` |
| `BASIS_INSPECTIES` | Basis Inspecties | Volledige inspectie-uitvoering, Assets, PWA-sync, rapportgeneratie + ondertekenen, **Klantportaal** | `BASIS_CRM` |
| `BASIS_WORKFLOW` | Basis Workflow | Notities, Favorieten, Notificaties, Taken | — |
| `WORKFLOW_COMPLEET` | Workflow Compleet | Documenten (DMS) + tags, Audit trail | `BASIS_WORKFLOW` |

**Core (altijd aan, niet schakelbaar — "later uitsplitsen"):** Authenticatie/onboarding, Profiel, Organisatie-instellingen (branding, BTW-config, nummerschema's), Gebruikersbeheer, globale Zoekfunctie, Dashboard, **E-mailsjablonen**, en de notificatie-**dispatch** (events/e-mail draaien app-breed). **Platform (alleen SUPERUSER, niet per-org gated):** Organisaties-beheer, Foutmeldingen, Inspectie-systeem-config (classificatiemodellen, normtypes, meetstaat-systeemtemplates, voice base-prompts).

**Add-ons (standaard inbegrepen bij Compleet; voor Basis-orgs à la carte per org bij te schakelen):**

| Feature-key | Label (NL) | Bevat | → vereist |
|---|---|---|---|
| `WEBHOOKS` | Webhooks (add-on) | Uitgaande integraties / webhooks | — |
| `CUSTOM_FIELDS` | Aangepaste velden (add-on) | Custom-field-definities op entiteiten | — |

### 1.1 Schematisch overzicht — Basis vs Compleet

```
DOMEIN          BASIS  (in elk basispakket)            COMPLEET (basis + onderstaande extra's)
──────────────────────────────────────────────────────────────────────────────────────────────
CRM             BASIS_CRM                              CRM_COMPLEET
                • Relaties                             + Aanvragen
                • Contactpersonen                      + Offertes (+ offertesjablonen, e-mailsjablonen)
                • Locaties                             + Klantgroepen
                                                       + Producten / Productgroepen / Prijstabellen
──────────────────────────────────────────────────────────────────────────────────────────────
UITVOERING      BASIS_UITVOERING                       UITVOERING_COMPLEET
                • Projecten (incl. volgers)            + Planning
                                                       + Werkbonnen
                                                       + iCal-feed
──────────────────────────────────────────────────────────────────────────────────────────────
INSPECTIES      BASIS_INSPECTIES                       (geen aparte "compleet" — alles zit in basis)
                • Inspectie-uitvoering + config
                • Assets + asset-/locatie-types
                • Meetstaten, findings, foto's, voice
                • PWA-sync (v2)
                • Rapportgeneratie + ondertekenen
                • Klantportaal (magic-link, inzien,
                  oplossen, ondertekenen, verzoeken)
──────────────────────────────────────────────────────────────────────────────────────────────
WORKFLOW        BASIS_WORKFLOW                         WORKFLOW_COMPLEET
                • Notities                             + Documenten (DMS) + tags
                • Favorieten                           + Audit trail
                • Notificaties (incl. "reminders")
                • Taken
──────────────────────────────────────────────────────────────────────────────────────────────
ALTIJD AAN      Auth · Profiel · Organisatie-instellingen · Gebruikers · Zoeken · Dashboard
                · E-mailsjablonen · Notificatie-dispatch (events/e-mail)
PLATFORM (SU)   Organisaties · Foutmeldingen · Inspectie-systeem
ADD-ONS (los)   Webhooks · Aangepaste velden (custom-fields)
```

---

## 2. Cross-check tegen huidige routing & endpoints

Elke staf-portal-route (`apps/portal/src/App.tsx`), klantportaal-route (`apps/client-portal`) en API-controller (`@Controller`) is hieronder aan een feature gekoppeld. **Alle huidige routes/endpoints zijn meegenomen.** De twijfelgevallen zijn in §2.4 inmiddels **beslist** (zie de beslis-tabel).

### 2.1 Staf-portal routes → feature

| Route(s) | Feature |
|---|---|
| `/login`, `/invite/:token`, `/forgot-password`, `/reset-password` | core (auth) |
| `/dashboard` | core (dashboard) |
| `/profile` | core (profiel) |
| `/users`, `/users/:id` | core (gebruikers) |
| `/organization/settings` | core (organisatie) |
| `/organizations`, `/organizations/:id` | platform (SUPERUSER) |
| `/error-reports` | platform (SUPERUSER) |
| `/search` | core (zoeken) |
| `/contacts`, `/contacts/:id`, `/contacts/persons*`, `/contacts/locations*` | `BASIS_CRM` |
| `/contacts/groups*` | `CRM_COMPLEET` (klantgroepen) |
| `/requests`, `/requests/:id` | `CRM_COMPLEET` |
| `/quotes*`, `/quote-templates*`, `/offerte/:token` (publiek) | `CRM_COMPLEET` |
| `/email-templates*` | core (altijd aan) |
| `/products*`, `/products/groups*`, `/price-tables*` | `CRM_COMPLEET` |
| `/projects`, `/projects/:id` | `BASIS_UITVOERING` |
| `/planning*`, `/work-orders*`, `/afspraak/:token` (publiek) | `UITVOERING_COMPLEET` |
| `/inspections*`, `/assets*` | `BASIS_INSPECTIES` |
| `/inspection-templates*`, `/checklists*`, `/checklist-items`, `/finding-templates*`, `/asset-types*`, `/location-types*`, `/lookups*`, `/voice-prompts/template`, `/measurement-sheet-templates*` | `BASIS_INSPECTIES` (config) |
| `/sign/:requestId` (publiek ondertekenen) | `BASIS_INSPECTIES` (tekent een `GeneratedDocument`, niet een offerte) |
| `/classification-models*`, `/norm-types*`, `/admin/voice-prompts` | platform (SUPERUSER, Inspectie-systeem), niet per-org gated |
| `/notities` | `BASIS_WORKFLOW` |
| `/favorites` | `BASIS_WORKFLOW` |
| `/notifications` | `BASIS_WORKFLOW` (notificaties = "reminders") |
| `/tasks`, `/tasks/:id` | `BASIS_WORKFLOW` |
| `/documents` | `WORKFLOW_COMPLEET` |

### 2.2 Klantportaal routes (`apps/client-portal`) → feature

Alle klantportaal-routes (`/dashboard`, `/inspections*`, `/documents/:id`, `/requests*`, `/magic/:token`, auth) horen bij **`BASIS_INSPECTIES`**. Het klantportaal draait volledig op het inspectiedomein (zie §3): documenten = `GeneratedDocument`/`DocumentSignature`, verzoeken = `ClientRequest`, berichten = `InspectionMessage` — géén afhankelijkheid van CRM Compleet of de DMS.

### 2.3 API-controllers → feature

| `@Controller` prefix(es) | Feature |
|---|---|
| `auth`, `users`, `organizations`, `search`, `vat`, `numbering-schemes`, `email-templates`, `error-reports`, `portal/stats`, notificatie-dispatch | core / platform |
| `contacts`, `kvk`, `geocoding` | `BASIS_CRM` |
| `customer-groups`, `requests`, `quotes`, `public/quotes`, `quote-templates`, `products`, `product-groups`, `price-tables` | `CRM_COMPLEET` |
| `projects` | `BASIS_UITVOERING` |
| `planning`, `public/planning`, `ical`, `work-orders` | `UITVOERING_COMPLEET` |
| `inspection-plans`, `assets`, `findings`, `finding-templates`, `photos`, `visual-inspections`, `measurement-records`, `measurement-sheet-records`, `measurement-sheet-templates`, `checklists`, `checklist-items`, `categories`, `asset-types`, `location-types`, `inspection-templates`, `inspection-locations`, `location-images`, `standalone-measurements`, `lookups`, `voice`, `voice-prompts`, `document-templates`, `generated-documents`, `signature-requests`, `sync` | `BASIS_INSPECTIES` |
| `client/auth`, `client/inspections`, `client/findings`, `client/documents`, `client/requests`, `client/lookups`, `client/inspections`(messages) | `BASIS_INSPECTIES` (klantportaal) |
| `notes`, `favorites`, `notifications`, `notification-prefs`, `tasks` | `BASIS_WORKFLOW` |
| `documents`, `document-tags`, `audit-logs` | `WORKFLOW_COMPLEET` |
| `classification-models`, `norm-types`, `admin/voice-prompts` | platform (SUPERUSER), niet per-org gated |
| `custom-fields` | add-on `CUSTOM_FIELDS` |
| `webhooks` | add-on `WEBHOOKS` |

### 2.4 ✅ Besloten (2026-06-22)

Alle eerder open punten zijn samen met de eigenaar beslist:

| # | Onderwerp | Besluit | Gevolg voor implementatie |
|---|---|---|---|
| 1 | Taken | **`BASIS_WORKFLOW`** | `tasks`-controller + `/tasks`-routes gated op Basis Workflow |
| 2 | Notificaties | **Dispatch = core-infra (altijd aan); UI-centrum + voorkeuren = `BASIS_WORKFLOW`** | `/notifications` + `notification-prefs` gated; events/e-mail blijven app-breed werken |
| 3 | E-mailsjablonen | **Core (altijd aan)** | `email-templates` ongated; verplaatst van CRM Compleet → core |
| 4 | Locatie-types | **`BASIS_INSPECTIES`, geen default-set** | Geen CRM-only-scenario: Inspecties is anker-product en draait altijd mét Basis CRM, dus elke org met locaties heeft ook locatie-types |
| 5 | BTW & nummerschema's | **Core (altijd aan)** | `vat` + `numbering-schemes` ongated; een nummerschema is alleen zichtbaar bij de feature waar het bij hoort |
| 6 | Aangepaste velden | **Add-on `CUSTOM_FIELDS`** | Standaard bij Compleet; voor Basis-orgs los per org bij te schakelen |
| 7 | Webhooks | **Add-on `WEBHOOKS`** | Standaard bij Compleet; voor Basis-orgs los per org bij te schakelen |
| 8 | KvK / geocoding / PDOK | **`BASIS_CRM`** | Adresverrijking gated op Basis CRM |
| 9 | Inspectie-systeem (classificatie / normtypes / meetstaat-systeem / voice base-prompts) | **Platform / SUPERUSER, niet per-org gated** | Alleen op `mijn.localhost`; gebruikt `@Roles(SUPERUSER)`, géén feature-key |
| + | Voice + losse metingen | **Beide in `BASIS_INSPECTIES`** | `voice` + `standalone-measurements` zijn onderdeel van het inspectiepakket |

> **Conclusie cross-check:** geen enkele bestaande route of controller blijft "wees" — alles is gemapt en alle twijfelgevallen zijn beslist. Er zijn twee nieuwe **add-on-keys** bijgekomen (`WEBHOOKS`, `CUSTOM_FIELDS`, zie §4.1). Claude Code kan de controllers nu volgens §2.1–§2.4 annoteren in Fase 1.

---

## 3. Haalbaarheidsanalyse — kan Basis een volledige workflow afronden?

**Vraag:** Kan een organisatie met alleen de basispakketten (`BASIS_CRM` + `BASIS_UITVOERING` + `BASIS_INSPECTIES` + `BASIS_WORKFLOW`) een complete workflow afronden — inclusief klantportaal — zonder modules die alleen in Compleet zitten?

**Antwoord: ja.** Dit is geverifieerd tegen het Prisma-schema en de service-laag. De kritieke afhankelijkheden zijn gecontroleerd:

| Stap in de workflow | Vereist model | Compleet-afhankelijkheid? |
|---|---|---|
| Relatie + locatie aanmaken | `Contact`, `Location` | Nee — `BASIS_CRM` |
| Project aanmaken | `Project` (vereist `contactId`, optioneel `locationId`/`projectId`) | Nee — `BASIS_UITVOERING` (leunt op `BASIS_CRM`) |
| Inspectieplan aanmaken | `InspectionPlan` (vereist `contactId`; `projectId` is **optioneel**) | Nee — `BASIS_INSPECTIES` |
| Inspectie uitvoeren (PWA) | `Asset`, `Finding`, `MeasurementRecord`, `Photo`, `SyncQueue` | Nee — `BASIS_INSPECTIES` |
| Rapport genereren + ondertekenen | `GeneratedDocument`, `DocumentSignature` | **Nee** — staat los van de DMS `Document` (Workflow Compleet) |
| Klantportaal: inzien/oplossen/ondertekenen | `InspectionClientAccess`, `FindingResolution`, `DocumentSignature` | **Nee** — inspectiedomein |
| Klantportaal: verzoek indienen | `ClientRequest` | **Nee** — los van CRM-`Request` (Compleet) |
| Notities / favorieten / notificaties | `Note`, `Favorite`, `Notification` | Nee — `BASIS_WORKFLOW` |

### 3.1 Twee plekken waar het (lichtjes) wringt — met voorstel

**A. Harde data-afhankelijkheid van `BASIS_CRM`.** `Project.contactId` en `InspectionPlan.contactId` zijn **verplicht**. Dus `BASIS_UITVOERING` en `BASIS_INSPECTIES` kunnen niet functioneren zonder `BASIS_CRM`. Omdat we kozen voor *onafhankelijke toggles met automatische afhankelijkheden*, is de oplossing simpel: in de catalogus krijgen beide `→ vereist: BASIS_CRM`. De entitlement-resolver (§4.3) past **dependency closure** toe: zet een SUPERUSER `BASIS_INSPECTIES` aan en `BASIS_CRM` uit, dan wordt `BASIS_CRM` automatisch (en zichtbaar in de UI) mee-aangezet. Geen schema-wijziging nodig.

**B. "Reminders".** Dit bleek **notificaties** te betekenen (intake-beslissing 1). De notificatie-modules bestaan al. Géén nieuw model nodig. Enige aandachtspunt: de notificatie-*dispatch* moet app-breed blijven werken; alleen de UI valt onder `BASIS_WORKFLOW` (zie §2.4 punt 2).

### 3.2 Voorstel — "Basis is een complete keten"

Om te garanderen dat elk basispakket dat je verkoopt ook echt een afrondbare keten oplevert, stellen we voor om in de catalogus deze afhankelijkheden vast te leggen (en in de Basis-plan-template alle vier de basisfuncties standaard aan te zetten):

```
BASIS_UITVOERING      → vereist BASIS_CRM
BASIS_INSPECTIES      → vereist BASIS_CRM
CRM_COMPLEET          → vereist BASIS_CRM
UITVOERING_COMPLEET   → vereist BASIS_UITVOERING (→ BASIS_CRM)
WORKFLOW_COMPLEET     → vereist BASIS_WORKFLOW
BASIS_WORKFLOW        → (geen; volledig entity-agnostisch)
```

Hiermee is elke geldige combinatie self-consistent en kan een Basis-org: relatie → project → inspectie → rapport → klant laat ondertekenen via portaal → klant dient vervolgverzoek in. Volledig rond, zonder Compleet.

---

## 4. Datamodel & architectuur

### 4.1 Bron-van-waarheid: catalogus in code

De **feature-catalogus** (keys, labels, afhankelijkheden, `isCore`) leeft in code als één getypte constante — versiebeheerd, niet door gebruikers wijzigbaar. De database slaat alleen **plannen** (templates) en **per-org-overrides** op, die naar feature-keys verwijzen.

```ts
// apps/api/src/modules/entitlements/feature-catalog.ts
export const FEATURE_KEYS = [
  'BASIS_CRM', 'CRM_COMPLEET',
  'BASIS_UITVOERING', 'UITVOERING_COMPLEET',
  'BASIS_INSPECTIES',
  'BASIS_WORKFLOW', 'WORKFLOW_COMPLEET',
  // Add-ons (standaard bij Compleet; voor Basis-orgs los bij te schakelen)
  'WEBHOOKS', 'CUSTOM_FIELDS',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureDef {
  key: FeatureKey;
  label: string;          // NL, voor de SUPERUSER-UI
  description: string;
  dependsOn: FeatureKey[]; // automatische afhankelijkheden
}

export const FEATURE_CATALOG: Record<FeatureKey, FeatureDef> = {
  BASIS_CRM:           { key: 'BASIS_CRM', label: 'Basis CRM', description: 'Relaties, contactpersonen, locaties', dependsOn: [] },
  CRM_COMPLEET:        { key: 'CRM_COMPLEET', label: 'CRM Compleet', description: 'Aanvragen, offertes, klantgroepen, producten & prijstabellen', dependsOn: ['BASIS_CRM'] },
  BASIS_UITVOERING:    { key: 'BASIS_UITVOERING', label: 'Basis Uitvoering', description: 'Projecten incl. volgers', dependsOn: ['BASIS_CRM'] },
  UITVOERING_COMPLEET: { key: 'UITVOERING_COMPLEET', label: 'Uitvoering Compleet', description: 'Planning + werkbonnen', dependsOn: ['BASIS_UITVOERING'] },
  BASIS_INSPECTIES:    { key: 'BASIS_INSPECTIES', label: 'Basis Inspecties', description: 'Inspecties, assets, PWA, rapportage, klantportaal', dependsOn: ['BASIS_CRM'] },
  BASIS_WORKFLOW:      { key: 'BASIS_WORKFLOW', label: 'Basis Workflow', description: 'Notities, favorieten, notificaties, taken', dependsOn: [] },
  WORKFLOW_COMPLEET:   { key: 'WORKFLOW_COMPLEET', label: 'Workflow Compleet', description: 'Documenten (DMS) + audit trail', dependsOn: ['BASIS_WORKFLOW'] },
  // Add-ons — standaard bij Compleet; voor Basis-orgs los per org bij te schakelen
  WEBHOOKS:            { key: 'WEBHOOKS', label: 'Webhooks (add-on)', description: 'Uitgaande integraties / webhooks', dependsOn: [] },
  CUSTOM_FIELDS:       { key: 'CUSTOM_FIELDS', label: 'Aangepaste velden (add-on)', description: 'Custom-field-definities op entiteiten', dependsOn: [] },
};
```

> Core-features (auth, profiel, organisatie, gebruikers, zoeken, dashboard) staan **niet** in de catalogus — ze zijn altijd aan en worden nooit gegate. Platform-controllers (SUPERUSER) gebruiken de bestaande `@Roles(Role.SUPERUSER)`-guard en hebben géén feature-key nodig.

### 4.2 Prisma-modellen (nieuw)

```prisma
model Plan {
  id          String   @id @default(uuid()) @db.Uuid
  name        String                       // "Basis", "Compleet"
  slug        String   @unique             // regex ^[a-z0-9]+$ (geen hyphens!)
  description String?
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  features      PlanFeature[]
  organizations Organization[]
  @@map("imp_plans")
}

model PlanFeature {
  id         String  @id @default(uuid()) @db.Uuid
  planId     String  @map("plan_id") @db.Uuid
  featureKey String  @map("feature_key")   // verwijst naar FEATURE_CATALOG
  plan       Plan    @relation(fields: [planId], references: [id], onDelete: Cascade)
  @@unique([planId, featureKey])
  @@map("imp_plan_features")
}

// Per-org delta t.o.v. het plan (alleen afwijkingen worden opgeslagen).
model OrganizationFeature {
  id         String   @id @default(uuid()) @db.Uuid
  orgId      String   @map("org_id") @db.Uuid
  featureKey String   @map("feature_key")
  enabled    Boolean                       // true = bijschakelen, false = afschakelen
  updatedById String? @map("updated_by_id") @db.Uuid
  updatedAt  DateTime @updatedAt @map("updated_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([orgId, featureKey])
  @@map("imp_organization_features")
}

// Toevoeging aan bestaand Organization-model:
//   planId String? @map("plan_id") @db.Uuid
//   plan   Plan?   @relation(fields: [planId], references: [id])
//   features OrganizationFeature[]
```

**Waarom overrides i.p.v. een gematerialiseerde set?** Het plan blijft een template; verander je het plan, dan schuift de baseline mee, terwijl per-org-uitzonderingen behouden blijven. Alleen de delta opslaan houdt de waarheid genormaliseerd en de SUPERUSER-UI eerlijk ("dit wijkt af van het plan").

### 4.3 EntitlementsService — effectieve set berekenen

```
getEnabledFeatures(orgId):
  1. base   = features van org.plan (PlanFeature[])         // template
  2. delta  = OrganizationFeature[] voor deze org           // overrides
            → enabled=true voegt toe, enabled=false haalt weg
  3. set    = (base ∪ {overrides:true}) \ {overrides:false}
  4. closure: voor elke feature in set, voeg dependsOn transitief toe   // auto-deps
  5. return set
```

- **Caching:** per-org effectieve set cachen (5 min TTL), net als `TenantCacheService`. Invalidatie bij elke schrijf op `Plan`, `PlanFeature`, `OrganizationFeature` of `Organization.planId`.
- **SUPERUSER:** heeft geen org → krijgt impliciet alles (bypass).
- **Dependency closure wint** van een afschakel-override: kun je `BASIS_CRM` niet afzetten zolang `BASIS_INSPECTIES` aanstaat. De SUPERUSER-UI waarschuwt hier vooraf voor (§5.3).

---

## 5. Enforcement

### 5.1 Backend — `FeatureGuard`

- Nieuwe decorator `@RequiresFeature('BASIS_INSPECTIES')` op controller-niveau (of per handler).
- Globale `FeatureGuard`, geregistreerd **ná** `TenantGuard` in `app.module.ts` (volgorde: Jwt → Roles → Tenant → **Feature**).
- Logica: SUPERUSER → door; anders `EntitlementsService.getEnabledFeatures(tenant.orgId)` (gecached) en check of de vereiste key erin zit. Zo niet → `403` met body `{ success:false, message:'Deze functie zit niet in uw abonnement', code:'FEATURE_NOT_IN_PLAN' }`.
- Publieke routes (`public/quotes`, `public/planning`, `client/*`, `signature-requests`, `ical`): resolven de org via token/slug en checken dezelfde feature (klantportaal = `BASIS_INSPECTIES`, publieke offerte = `CRM_COMPLEET`, etc.).
- Nieuw endpoint **`GET /organizations/me/features`** → `string[]` effectieve keys, voor de frontend-bootstrap. Eventueel meeleveren in de bestaande `by-slug`/branding-call om een extra request te besparen.

### 5.2 Frontend — route-guard + "functie niet in abonnement"-pagina

- `FeatureProvider` (portal én client-portal) haalt bij bootstrap de effectieve keys op (`useFeatures()`), naast `TenantProvider`/`AuthProvider`.
- `<FeatureRoute feature="CRM_COMPLEET">…</FeatureRoute>` rond elke gegate route. Niet toegekend → render **`FeatureNotInPlanPage`**:
  > **Deze functie zit niet in uw abonnement.** Neem contact op met uw beheerder om dit pakket uit te breiden.
- `sidebar.tsx`: bestaande `roles`-filter uitbreiden met een `feature?`-veld per nav-item; items zonder toegekende feature worden verborgen (parents verbergen als alle children weg zijn).
- Belangrijk: de pagina verschijnt óók bij **deeplink/refresh** op een gegate route (niet alleen bij navigatie), zodat de gebruiker nooit een kapotte/lege pagina ziet.

### 5.3 SUPERUSER-beheer-UI

- **Abonnementen** (nieuw, op `mijn.localhost` onder platform-beheer): CRUD op `Plan` + per-plan feature-toggles (checkbox-lijst uit `FEATURE_CATALOG`, met visuele weergave van afhankelijkheden).
- **Per organisatie** (op de bestaande org-detailpagina in Organisaties): kies het `Plan` (template) en zet per feature een **override** (aan/uit) bovenop het plan. UI toont per feature: `uit plan` / `bijgeschakeld` / `afgeschakeld`, en **waarschuwt** als een afschakeling een afhankelijkheid breekt (bijv. CRM uit terwijl Inspecties aan).
- Audit trail aanzetten op `Plan`, `PlanFeature`, `OrganizationFeature` en `Organization.planId` (bestaande audit-infrastructuur, §"Audit Trail Uitbreiden" in CLAUDE.md).

### 5.4 Downgrade & data-retentie

Zet een SUPERUSER een feature uit terwijl er al data is, dan:
- **Data blijft bewaard** — géén cascade-delete. Records worden alleen ontoegankelijk via de reguliere UI en API (`FeatureGuard` → `403 FEATURE_NOT_IN_PLAN`).
- **Export/inzage blijft mogelijk.** Een expliciet export-pad (`@AllowDowngradedExport()`, slaat de `FeatureGuard` over, vereist SUPERUSER of expliciete org-toestemming, **altijd ge-audit-logd**) kan de data nog ophalen, zodat een klant bij opzegging/downgrade niets kwijtraakt.
- **Heractivatie** maakt de data direct weer zichtbaar — geen migratie of herstel nodig.

---

## 6. Gefaseerd implementatieplan (voor Claude Code)

> Volg de bestaande conventies: Prisma-migraties vanuit `apps/api/`, geen `db push`, `npx turbo run build` vanuit root, unit + e2e tests groen. Branch per fase: `feat/saas-entitlements-faseN`.

### Fase 0 — Catalogus + datamodel + resolver (geen gedragsverandering)
- `feature-catalog.ts` (§4.1) + `EntitlementsService` (§4.3) in een nieuwe `entitlements`-module.
- Prisma: `Plan`, `PlanFeature`, `OrganizationFeature`, `Organization.planId` + migratie. Seed-cleanup-volgorde bijwerken (`organizationFeature → planFeature → plan`, en `plan` vóór `organization`-relatie).
- Unit tests: closure, overrides (toevoegen/afhalen), cache-invalidatie.
- **Acceptatie:** resolver geeft correcte set voor (a) plan-only, (b) plan + bijschakel-override, (c) plan + afschakel-override, (d) afschakeling die door closure teruggezet wordt. Nog geen enforcement.

### Fase 1 — Backend enforcement
- `@RequiresFeature()` + globale `FeatureGuard` (na `TenantGuard`).
- Alle controllers annoteren volgens §2.3 (na bevestiging van §2.4).
- `GET /organizations/me/features`.
- **Acceptatie (e2e):** Basis-org → `403 FEATURE_NOT_IN_PLAN` op `/quotes`, `/planning`, `/work-orders`, `/documents`; `200` op `/contacts`, `/projects`, `/inspection-plans`, `/notes`. Compleet-org → overal `200`. SUPERUSER → bypass.

### Fase 2 — Frontend gating (portal + client-portal)
- `FeatureProvider` + `useFeatures()` + `<FeatureRoute>` + `FeatureNotInPlanPage`.
- Alle routes uit §2.1/§2.2 wrappen; `sidebar.tsx` `feature`-filter.
- **Acceptatie:** Basis-org ziet geen Offertes/Planning/Werkbonnen/Documenten in de nav; deeplink naar `/quotes` toont de "niet in abonnement"-pagina; klantportaal werkt volledig op een Basis-org.

### Fase 3 — SUPERUSER-beheer-UI
- Abonnementen-CRUD + per-org plan-keuze + overrides met dependency-validatie/waarschuwingen (§5.3).
- Audit trail op de nieuwe modellen.
- **Acceptatie:** SUPERUSER maakt plan "Basis" en "Compleet"; wijst ze toe; schakelt op één Basis-org `WORKFLOW_COMPLEET` bij → `/documents` wordt direct toegankelijk (na cache-TTL of na invalidatie).

### Fase 4 — Seed-varianten + end-to-end validatie
- Seed ≥2 orgs (§7) + testscenario's draaien (browser-smoketest + e2e).
- **Acceptatie:** §7.3-matrix volledig groen.

---

## 7. Seed-plan & testscenario's (deliverable 4)

> De feature-laag bestaat nog niet, dus dit seed-script draait pas ná Fase 0–1. Hieronder de kant-en-klare seed-uitbreiding + de testmatrix die we per variant aflopen.

### 7.1 Twee (drie) organisaties

| Org | Slug | Plan | Effectieve features | Doel |
|---|---|---|---|---|
| InspeXi Basis | `inspexibasis` | **Basis** | `BASIS_CRM`, `BASIS_UITVOERING`, `BASIS_INSPECTIES`, `BASIS_WORKFLOW` (+ core) | Test dat Compleet-functies geblokkeerd zijn én de basis-keten rond is |
| InspeXi Compleet | `inspexicompleet` | **Compleet** | alle 9 features incl. add-ons `WEBHOOKS` + `CUSTOM_FIELDS` (+ core) | Test dat alles toegankelijk is |
| _(optioneel)_ InspeXi Mix | `inspeximix` | **Basis** + override `WORKFLOW_COMPLEET=true` | Basis + Documenten | Test per-org bijschakelen bovenop het plan |

Slugs bevatten **geen hyphens** (regex `^[a-z0-9]+$`). Per org: een ORG_ADMIN, een INSPECTEUR, minimaal 1 relatie, 1 project, 1 inspectieplan met asset + finding, zodat de basis-keten daadwerkelijk te doorlopen is. Wachtwoord conform seed: `Password123!`.

### 7.2 Seed-uitbreiding (illustratief — `apps/api/prisma/seed.ts`)

```ts
// 1) Plannen (templates)
const basisPlan = await prisma.plan.create({
  data: { name: 'Basis', slug: 'basis', sortOrder: 1, features: { create: [
    { featureKey: 'BASIS_CRM' }, { featureKey: 'BASIS_UITVOERING' },
    { featureKey: 'BASIS_INSPECTIES' }, { featureKey: 'BASIS_WORKFLOW' },
  ] } },
});
const compleetPlan = await prisma.plan.create({
  data: { name: 'Compleet', slug: 'compleet', sortOrder: 2, features: { create:
    FEATURE_KEYS.map((featureKey) => ({ featureKey })) } }, // alle 9, incl. add-ons WEBHOOKS + CUSTOM_FIELDS
});

// 2) Organisaties koppelen aan een plan
await prisma.organization.create({ data: { name: 'InspeXi Basis', slug: 'inspexibasis', planId: basisPlan.id /* …users, contact, project, inspectionPlan… */ } });
await prisma.organization.create({ data: { name: 'InspeXi Compleet', slug: 'inspexicompleet', planId: compleetPlan.id /* … */ } });

// 3) (optioneel) per-org override: Basis-org krijgt Documenten erbij
await prisma.organizationFeature.create({ data: { orgId: mixOrgId, featureKey: 'WORKFLOW_COMPLEET', enabled: true } });
```

> Cleanup-volgorde in `seed.ts` (kinderen eerst): `organizationFeature` → `planFeature` → `…bestaande org-kinderen…` → `organization` → `plan`.

### 7.3 Testmatrix (per variant aflopen)

| Scenario | `inspexibasis` (Basis) | `inspexicompleet` (Compleet) |
|---|---|---|
| `/contacts`, `/projects`, `/inspections`, `/notities`, `/favorites`, `/notifications` | ✅ toegankelijk | ✅ |
| `/quotes`, `/requests`, `/contacts/groups`, `/products`, `/price-tables` | 🚫 "niet in abonnement" + API `403` | ✅ |
| `/planning`, `/work-orders` | 🚫 | ✅ |
| `/documents` (DMS) | 🚫 | ✅ |
| Sidebar toont geen gegate items | ✅ (Offertes/Planning/Documenten verborgen) | ✅ alles zichtbaar |
| Deeplink/refresh op gegate route | ✅ toont de pagina (geen crash) | n.v.t. |
| **Basis-keten end-to-end**: relatie → project → inspectieplan → asset+finding → rapport genereren → ondertekenen | ✅ volledig rond | ✅ |
| **Klantportaal** (`:5174`): magic-link → inspectie inzien → constatering oplossen + foto → document ondertekenen → verzoek indienen | ✅ volledig | ✅ |
| API `GET /organizations/me/features` | bevat 4 basis-keys (+ deps) | bevat 9 keys (incl. add-ons) |
| Override-org `inspeximix`: `/documents` | ✅ (bijgeschakeld) terwijl `/quotes` 🚫 | n.v.t. |
| Dependency-closure: SUPERUSER zet op Basis-org `BASIS_CRM` uit | UI waarschuwt; closure houdt CRM aan zolang Inspecties/Projecten aan | n.v.t. |

---

## 8. Commerciële keuzes — besloten (2026-06-22)

| Onderwerp | Besluit | Gevolg voor implementatie |
|---|---|---|
| Plan-templates | **Alleen "Basis" en "Compleet" nu** | Extra/mix-plannen ("Inspecties Only" e.d.) later toe te voegen als extra `Plan`-records — geen codewijziging nodig |
| Add-ons (`WEBHOOKS`, `CUSTOM_FIELDS`) | **Standaard inbegrepen bij Compleet**; voor Basis-orgs los bij te schakelen | Compleet-plan = alle 9 features; Basis-plan = 4 basisfeatures, add-ons via per-org override |
| Downgrade-gedrag | **Data bewaren + ontoegankelijk in UI; export/SUPERUSER-toegang blijft** | `FeatureGuard` blokkeert reguliere UI/API; een expliciet export-/SUPERUSER-pad blijft data lezen (zie §5.4) |

> Hiermee zijn alle mapping- én commerciële keuzes vastgelegd. Niets blokkeert meer de start van Fase 0.
