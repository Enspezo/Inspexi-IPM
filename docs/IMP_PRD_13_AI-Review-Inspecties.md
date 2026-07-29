# IMP_PRD_13 — AI-review van inspectierapporten (vier-ogen + AI-voorcontrole)

*Status: concept — 15 juli 2026*
*Bijbehorend uitvoeringsdoc: `docs/IMP_PRD_13_APPLY-WITH-CLAUDE-CODE.md`*

## 13.0 TL;DR / Kernbeslissingen

- Het **vier-ogen-principe** (indienen ter review → beoordelen) bestaat al op `InspectionPlan` (`POST :id/submit` / `POST :id/review`). Dit wordt **per organisatie in/uitschakelbaar** via `Organization.inspectionReviewEnabled` (default `true` = huidig gedrag).
- Nieuw: **AI-voorcontrole**. Als `Organization.aiReviewEnabled` aan staat (default `false`) én de org het add-on-entitlement **`AI_REVIEW`** heeft, draait er bij het indienen ter review automatisch een Claude-analyse over de uitvoeringsdata (findings, metingen, checklists, assets) **plus** het gegenereerde rapport. Het resultaat is een **checklist van aandachtspunten** voor de menselijke controleur.
- De AI is **adviserend, nooit blokkerend**: geen enkele statustransitie hangt af van de AI-uitkomst. Faalt de AI (geen key, timeout, parse-fout), dan verloopt de review exact zoals nu.
- Trigger: **automatisch bij `submit()`** (asynchroon, fire-and-forget) + handmatige her-run-knop voor de reviewer.
- Techniek volgt het **voice-module-precedent**: `@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`, configureerbaar model, graceful disable zonder key.
- Relatie met **IMP_PRD_10 §9** (AI-chat/RAG-haken): zelfde API-key en client-patroon; dit PRD introduceert een herbruikbare gedeelde Anthropic-client zodat de latere help-chatbot (PRD-10 fase 6) dezelfde infrastructuur gebruikt.

## 13.1 Doel

Controleurs (vier-ogen-principe) besteden veel tijd aan het vinden van routinematige fouten in inspectierapporten: vergeten foto's, metingen buiten de norm die niet als afwijking terugkomen, lege checklistitems, inconsistenties tussen constatering en conclusie, taal-/rapportagefouten. Een AI-voorcontrole signaleert deze onregelmatigheden vooraf en zet ze op een afvinklijst, zodat de menselijke controleur gericht en sneller kan werken. Organisaties die geen review willen, of geen AI willen, zetten dit per organisatie uit.

## 13.2 Kernconcepten & terminologie

| Term | Betekenis |
|---|---|
| Vier-ogen-review | Bestaande flow: inspecteur dient plan in (`in_progress → pending_review`), reviewer keurt goed/af (`approved` / `reviewed`). |
| AI-review | Eén analyse-run van Claude over een ingediend inspectieplan; resultaat = `AiReviewRun` + `AiReviewItem[]`. |
| AI-review-item | Eén aandachtspunt (severity + categorie + omschrijving + optionele verwijzing naar asset/finding/meting), af te vinken of af te wijzen door de reviewer. |
| Controleur / reviewer | Gebruiker met een rol uit `REVIEW_ROLES` (SUPERUSER, ORG_ADMIN, MANAGER, WERKVOORBEREIDER). |

## 13.3 Uitgangspunten & besluiten

1. **Adviserend, niet gaterend.** AI-uitkomsten beïnvloeden nooit de statusmachine. Items afvinken is optioneel; goedkeuren kan met open items.
2. **Automatisch bij indienen.** `InspectionPlansService.submit()` start de AI-run asynchroon (zelfde fire-and-forget-patroon als notificaties). De reviewer kan daarnaast handmatig (opnieuw) laten draaien, bijv. na een afkeuring + herindiening.
3. **Input = gestructureerde data + rapport.** De AI krijgt (a) plan-metadata, (b) de AssetNode-scope met findings, visual inspections, meetstaat-/meetrecords en checklist-antwoorden, en (c) de tekst van het meest recente `GeneratedDocument` van type `REPORT` (HTML → platte tekst, getrunceerd). Ontbreekt een gegenereerd rapport, dan draait de analyse alleen op (a)+(b) en meldt de AI dit als eerste item.
4. **Dubbele poort voor AI:** entitlement `AI_REVIEW` (SUPERUSER kent toe, add-on-model zoals `WEBHOOKS`) én org-toggle `aiReviewEnabled` (ORG_ADMIN zet aan/uit). Zo blijft dit later commercieel afprijsbaar zonder dat elke org 'm per ongeluk aan heeft.
5. **Vier-ogen-toggle is primair UI- en validatie-gating.** Bij `inspectionReviewEnabled = false` verbergt de portal het submit/review-blok en mag een plan direct `in_progress → completed` (via de bestaande `update()`-statusroute, mirror van de PWA). Bij `true` (default) weigert de service de transitie naar `completed`/`approved` zolang `reviewedAt` leeg is. De `/sync`-push van de PWA wordt hier **niet** door geblokkeerd (PWA kent alleen uitvoeringsstatussen).
6. **Graceful degradation.** Geen `ANTHROPIC_API_KEY` → AI-review is systeembreed onbeschikbaar (zoals `voice`): toggle in org-instellingen toont "niet beschikbaar", submit start geen run, geen errors richting gebruiker.
7. **Eén run per indiening is de norm.** Her-runs overschrijven niet: elke run is een nieuwe `AiReviewRun`; de UI toont de laatste, oudere blijven raadpleegbaar (transparantie/audit).
8. **Kostenbeheersing.** Input wordt begrensd (zie §13.6); her-run is throttled; tokens worden per run gelogd zodat kosten per org inzichtelijk zijn.
9. **Taal.** Alle AI-output (items, samenvatting) in het **Nederlands**.

## 13.4 Org-configuratie & entitlement

### 13.4.1 Nieuwe velden op `Organization`

```prisma
// Inspectie-review (vier-ogen + AI-voorcontrole)
inspectionReviewEnabled Boolean @default(true)  @map("inspection_review_enabled")
aiReviewEnabled         Boolean @default(false) @map("ai_review_enabled")
aiReviewInstructions    String? @map("ai_review_instructions") @db.Text
```

- `aiReviewInstructions`: optionele org-specifieke accenten voor de prompt ("let extra op NEN 3140-terminologie", "onze rapporten mogen geen u-vorm bevatten"). Wordt als extra promptlaag meegestuurd — zelfde gedachte als de voice-template/user-prompts, maar bewust simpel gehouden (één tekstveld i.p.v. drie modellen). Uitbreiden naar het volledige 3-lagen-model is "later" (§13.13).
- `UpdateOrganizationDto` + org-settings-UI worden uitgebreid (zoals `chatEnabled`).

### 13.4.2 Entitlement

Nieuw add-on-key in `packages/entitlements/src/feature-catalog.ts`:

```ts
AI_REVIEW: {
  key: 'AI_REVIEW',
  label: 'AI-rapportcontrole (add-on)',
  description: 'AI-voorcontrole van inspectierapporten vóór de menselijke review',
  dependsOn: ['BASIS_INSPECTIES'],
},
```

Endpoints van de ai-review-module krijgen `@RequiresFeature('AI_REVIEW')`. De org-toggle `aiReviewEnabled` blijft daarbinnen de gebruikersschakelaar (entitlement = mag, toggle = wil).

## 13.5 Datamodel (Prisma)

Twee nieuwe modellen (tabellen met `imp_`-prefix, conform conventies; migratie vanuit `apps/api/`, nooit `db push`).

```prisma
enum AiReviewRunStatus {
  PENDING     // aangemaakt, run nog niet gestart/bezig
  COMPLETED   // analyse gelukt, items beschikbaar
  FAILED      // fout (API/timeout/parse) — errorMessage gevuld
}

enum AiReviewItemSeverity {
  CRITICAL    // waarschijnlijk fout in het rapport (bijv. meting buiten norm zonder afwijking)
  WARNING     // verdacht / inconsistent, controleren
  SUGGESTION  // verbeterpunt (formulering, volledigheid)
  INFO        // ter kennisgeving
}

enum AiReviewItemStatus {
  OPEN
  CHECKED     // door reviewer afgevinkt (gezien/afgehandeld)
  DISMISSED   // door reviewer afgewezen (niet relevant / vals alarm)
}

model AiReviewRun {
  id               String            @id @default(uuid()) @db.Uuid
  orgId            String            @map("org_id") @db.Uuid
  inspectionPlanId String            @map("inspection_plan_id") @db.Uuid
  generatedDocumentId String?        @map("generated_document_id") @db.Uuid
  status           AiReviewRunStatus @default(PENDING)
  triggeredBy      String?           @map("triggered_by") @db.Uuid // null = automatisch bij submit
  model            String            // gebruikt Claude-model (audit/kosten)
  summary          String?           @db.Text // NL-samenvatting van de AI
  errorMessage     String?           @map("error_message")
  inputTokens      Int?              @map("input_tokens")
  outputTokens     Int?              @map("output_tokens")
  startedAt        DateTime?         @map("started_at")
  completedAt      DateTime?         @map("completed_at")
  createdAt        DateTime          @default(now()) @map("created_at")

  organization    Organization       @relation(fields: [orgId], references: [id], onDelete: Cascade)
  inspectionPlan  InspectionPlan     @relation(fields: [inspectionPlanId], references: [id], onDelete: Cascade)
  generatedDocument GeneratedDocument? @relation(fields: [generatedDocumentId], references: [id], onDelete: SetNull)
  triggeredByUser User?              @relation("AiReviewRunTriggeredBy", fields: [triggeredBy], references: [id])
  items           AiReviewItem[]

  @@index([orgId, inspectionPlanId])
  @@map("imp_ai_review_runs")
}

model AiReviewItem {
  id          String               @id @default(uuid()) @db.Uuid
  orgId       String               @map("org_id") @db.Uuid
  runId       String               @map("run_id") @db.Uuid
  severity    AiReviewItemSeverity
  category    String               // vrije NL-categorie uit de prompt-taxonomie (§13.6.3)
  title       String
  description String               @db.Text
  // Optionele verwijzingen zodat de UI kan deeplinken; AI levert deze alleen
  // als het id in de input voorkwam — service valideert vóór opslag.
  assetNodeId         String? @map("asset_node_id") @db.Uuid
  findingId           String? @map("finding_id") @db.Uuid
  measurementRecordId String? @map("measurement_record_id") @db.Uuid
  status      AiReviewItemStatus   @default(OPEN)
  checkedBy   String?              @map("checked_by") @db.Uuid
  checkedAt   DateTime?            @map("checked_at")
  sortOrder   Int                  @default(0) @map("sort_order")
  createdAt   DateTime             @default(now()) @map("created_at")

  run           AiReviewRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  assetNode     AssetNode?  @relation(fields: [assetNodeId], references: [id], onDelete: SetNull)
  finding       Finding?    @relation(fields: [findingId], references: [id], onDelete: SetNull)
  checkedByUser User?       @relation("AiReviewItemCheckedBy", fields: [checkedBy], references: [id])

  @@index([runId])
  @@map("imp_ai_review_items")
}
```

Aandachtspunten:
- **Seed-opruimvolgorde** (kinderen eerst): `aiReviewItem → aiReviewRun` vóór `inspectionPlan` en vóór `assetNode`/`finding` (SetNull-FK's zijn onschuldig, maar Cascade op run/plan vereist volgorde). Toevoegen aan `prisma/seed.ts` én aan de E2E-teardown-conventies.
- **Audit trail**: `AiReviewItem` toevoegen aan de registry `AUDITED_ENTITIES` in `common/audit/audited-entities.ts` (daaruit worden `AUDITED_MODELS`, `MODEL_TABLE_MAP` en `ALLOWED_ENTITY_TYPES` afgeleid; FK-resolutie volgt automatisch uit de Prisma-DMMF via `common/audit/fk-resolvers.ts`). Het afvinken/afwijzen door de reviewer is de menselijke handeling die je wilt kunnen herleiden. `AiReviewRun` zelf niet auditen (machine-gegenereerd, eigen timestamps).
- Portal-types in `apps/portal/src/types/index.ts` aanvullen.

## 13.6 AI-analyse: module `ai-review`

Nieuwe module `apps/api/src/modules/ai-review/` naar het voorbeeld van `voice/`.

### 13.6.1 Gedeelde Anthropic-client

Nieuw: `common/services/anthropic/anthropic-client.service.ts` (@Global via bestaand common-patroon):
- Wrapt `new Anthropic({ apiKey: ANTHROPIC_API_KEY })`; `isAvailable()`-check zoals `voice-parse.service.ts`.
- Modelkeuze per aanroeper: `voice` blijft `ANTHROPIC_MODEL` gebruiken; ai-review gebruikt `ANTHROPIC_REVIEW_MODEL` (default gelijk aan `ANTHROPIC_MODEL`-default, nu `claude-sonnet-4-6`).
- `VoiceParseService` wordt hierop gerefactord (kleine wijziging, gedrag identiek); de latere help-chatbot (PRD-10 §9/fase 6) gebruikt dezelfde service. Dit is de enige structurele overlap met het AI-chat-spoor — bewust klein gehouden.

### 13.6.2 Inputopbouw (`AiReviewInputBuilder`)

Bouwt één compacte JSON-payload:
- **Plan**: titel, projectnummer, normtype(s), hoofdlocatie + scope-deellocaties (nodeNumbers/namen), inspecteur, geplande vs. werkelijke datum.
- **Per asset in scope**: type, naam/nodeNumber, checklist-antwoorden (vraag + antwoord + eventueel "n.v.t."), visual inspections, meetrecords en meetstaat-records (type, waarde, eenheid, fase, PASS/FAIL), findings (template, omschrijving, ernst, foto-aantal — niet de foto's zelf).
- **Rapport**: laatste `GeneratedDocument` met `documentType = REPORT`; `editedContent ?? htmlContent` → platte tekst (bestaande tiptap/HTML-renderers hergebruiken of `htmlToText`), max ~40k tekens, bij truncatie een marker zodat de AI weet dat het rapport is afgekapt.
- Harde bovengrens op de totale payload (~100k tekens); bij overschrijding eerst rapport, dan checklist-antwoorden inkorten. Foto's/binaire content gaan **niet** mee (kosten/privacy); wel metadata ("finding X heeft 0 foto's").

### 13.6.3 Prompt & output

System-prompt-lagen (concat, zoals `buildCombinedPrompt` in voice):
1. **Base-prompt** (code-constant `default-review-prompt.ts`, NL): rol ("Je bent een ervaren SCIOS/NEN-inspectiecontroleur…"), de categorie-taxonomie — `VOLLEDIGHEID`, `CONSISTENTIE`, `NORMERING`, `TAAL`, `OVERIG` — en de severity-definities, met expliciete instructie: alléén punten die een menselijke controleur zou willen zien, geen herhaling van correcte zaken, verwijs waar mogelijk naar meegegeven id's.
2. **Norm-context** o.b.v. normtype-code(s) van het plan (zelfde bron als voice).
3. **Org-instructies**: `Organization.aiReviewInstructions` (indien gevuld).

Output wordt afgedwongen via **tool-use** (één tool `report_review_findings` met JSON-schema: `summary: string`, `items: [{ severity, category, title, description, assetNodeId?, findingId?, measurementRecordId? }]`) — robuuster dan ```json```-fences parsen zoals voice nu doet. `max_tokens` 4096, timeout 120s, één retry bij transient errors.

### 13.6.4 Runverloop (`AiReviewService`)

1. `startRun(planId, orgId, triggeredBy?)`: guard-checks (entitlement, `aiReviewEnabled`, `isAvailable()`, plan bestaat + org-scoped) → maak `AiReviewRun` (PENDING, `startedAt`) → draai analyse **buiten de request-cyclus** (`setImmediate`/promise zonder await, errors gelogd — zelfde stijl als notification-dispatch).
2. Succes: valideer alle terugverwezen id's tegen de input (onbekende id's → verwijzing strippen, item behouden), schrijf items + summary + tokencounts, status `COMPLETED`, notificatie naar de reviewer (§13.8).
3. Fout: status `FAILED` + `errorMessage` (NL, zonder stacktrace); geen notificatie-spam — de reviewer ziet het in de UI en kan her-runnen.
4. Concurrency: max één PENDING run per plan (nieuwe start terwijl er één loopt → 409 "Er draait al een AI-analyse voor dit plan").

## 13.7 API-ontwerp

Alle routes org-scoped, `@RequiresFeature('AI_REVIEW')` behalve waar vermeld; response-format `{ success, data }`.

| Route | Methode | Rollen | Doel |
|---|---|---|---|
| `/inspection-plans/:id/ai-review` | GET | ALL_STAFF | Laatste run + items (voor het review-blok); `?all=true` → alle runs |
| `/inspection-plans/:id/ai-review` | POST | REVIEW_ROLES | Handmatige (her)run; `@Throttle` 5/min |
| `/ai-review-items/:id` | PATCH | REVIEW_ROLES | `{ status: 'CHECKED' \| 'DISMISSED' \| 'OPEN' }` → zet ook `checkedBy/checkedAt` |
| `/ai-review/status` | GET | ALL_STAFF, geen feature-gate | Beschikbaarheid (key aanwezig, model) — voor de org-settings-UI, analoog aan `GET /voice/status` |

Wijzigingen aan bestaande modules:
- **`inspection-plans.service.ts` — `submit()`**: na de status-update en de `INSPECTIEPLAN_TER_REVIEW`-notificatie: als org `AI_REVIEW`-entitlement + `aiReviewEnabled` + `isAvailable()` → `aiReviewService.startRun(plan.id, plan.orgId)` fire-and-forget. Let op NestJS-dependency-richting: `InspectionPlansModule` importeert `AiReviewModule` (niet andersom) — ai-review leest plannen via Prisma, niet via `InspectionPlansService`, om een cycle te vermijden.
- **`inspection-plans.service.ts` — vier-ogen-gate**: in `update()` (en `complete`-achtige paden): als `org.inspectionReviewEnabled === true` en de gevraagde `statusCode ∈ {completed, approved}` terwijl `reviewedAt` leeg is → `BadRequestException('Dit plan moet eerst beoordeeld worden (vier-ogen-principe)')`. Org via `TenantContext`/lookup; geen extra query in de hot path (plan is al geladen, org-vlag via bestaande org-cache).
- **`organizations`**: `update-organization.dto.ts` + controller: `inspectionReviewEnabled`, `aiReviewEnabled`, `aiReviewInstructions` (ORG_ADMIN mag deze zetten, zoals `chatEnabled`).

## 13.8 Notificaties

Nieuw `NotificationType`: **`AI_REVIEW_GEREED`** ("AI-controle afgerond voor inspectie {titel}") → naar `plan.reviewerId` (indien gezet), anders geen notificatie (de reviewer-rol ziet het bij het openen van het plan). Enum-migratie + `notifications.constants.ts` (groep: inspecties) + `apps/portal/src/lib/notifications.ts` (NL-label, icoon, link naar `/inspections/:id`). Bewust géén `AI_REVIEW_MISLUKT`-notificatie (ruis; zichtbaar in UI).

## 13.9 Portal UI

### 13.9.1 Inspectie-detailpagina (`inspection-detail-page.tsx`)

Het bestaande review-blok (`awaitingReview`) wordt uitgebreid met een **AI-controle-paneel** (nieuw co-located component `components/ai-review-panel.tsx`, data via nieuwe hooks in `hooks/use-ai-review.ts`):
- Statusregel: "AI-analyse bezig…" (PENDING, poll 5s via TanStack `refetchInterval`), "AI-analyse mislukt — [Opnieuw]" (FAILED), of samenvatting + itemlijst (COMPLETED).
- Items gegroepeerd op severity (CRITICAL bovenaan), met `StatusBadge`-stijl severity-pills, categorie-label, omschrijving, en deeplink naar het asset/finding-tab wanneer een verwijzing aanwezig is.
- Per item: afvinken (✓ CHECKED) of afwijzen (✗ DISMISSED) — alleen voor `canReviewRoles`; teller "3 van 7 punten behandeld". Afgevinkte/afgewezen items zakken naar beneden (doorgestreept resp. gedimd).
- Knop "AI-analyse opnieuw uitvoeren" (REVIEW_ROLES) + weergave van modelnaam en tijdstip van de run.
- Paneel is alleen zichtbaar als de org-feature actief is; zonder runs toont het niets (geen lege kaart).
- Bij `inspectionReviewEnabled = false`: submit-knop en review-blok verbergen; in plaats daarvan directe "Afronden"-actie (bestaande status-update).

### 13.9.2 Organisatie-instellingen (`organization-settings-page.tsx`)

Nieuw tab-onderdeel **"Inspecties"** (of uitbreiding van een bestaand logisch tab):
- Toggle "Vier-ogen-controle verplicht" (`inspectionReviewEnabled`) met uitlegtekst.
- Toggle "AI-voorcontrole" (`aiReviewEnabled`) — disabled + hint "Niet beschikbaar in uw abonnement" zonder `AI_REVIEW`-entitlement, en disabled + hint "AI-dienst niet geconfigureerd" als `/ai-review/status` onbeschikbaar meldt.
- Textarea "Extra AI-instructies" (`aiReviewInstructions`, max 2000 tekens) — alleen actief als AI-voorcontrole aan staat.

### 13.9.3 SUPERUSER

Geen nieuwe schermen: `AI_REVIEW` verschijnt automatisch in de bestaande entitlements-tab (`organization-entitlements-tab.tsx`) zodra de catalogus is uitgebreid.

## 13.10 Beveiliging, privacy & kosten

- **Tenant-isolatie**: alle queries org-scoped (`orgScope(user)`), verwezen id's gevalideerd met `assertSameOrg` waar van toepassing; cross-tenant E2E-case toevoegen.
- **Privacy**: alleen inspectie-inhoud gaat naar Anthropic; geen gebruikers-e-mails, geen klant-contactgegevens buiten wat al in het rapport staat, geen foto's. Dit wordt gedocumenteerd in de org-settings-uitlegtekst zodat de ORG_ADMIN een geïnformeerde keuze maakt.
- **Kosten**: tokens per run gelogd (`inputTokens/outputTokens`); her-run throttled; payload-truncatie (§13.6.2). Toekomstig quotum per org kan aanhaken op de bestaande Quota-infrastructuur (buiten scope).
- **Prompt-injectie**: rapportinhoud is deels door gebruikers geschreven. De base-prompt instrueert expliciet dat de documentinhoud *data* is, geen instructies; output is bovendien via tool-schema begrensd en de service valideert id's — impact van injectie blijft beperkt tot onzin-items die de reviewer wegklikt.

## 13.11 Audit, seed & tests

- **Seed**: bij `SEED_DEMO=1` één COMPLETED `AiReviewRun` + 4–5 items (mix van severities, één met finding-verwijzing) op het demo-inspectieplan; InspeXi Demo-org krijgt `aiReviewEnabled = true` + `AI_REVIEW`-override. Opruimvolgorde: `aiReviewItem → aiReviewRun` toevoegen vóór de inspectieplan-cleanup.
- **Unit**: `AiReviewService` (guards, id-validatie, FAILED-pad, concurrency-409), `AiReviewInputBuilder` (truncatie, ontbrekend rapport), submit-hook (wel/niet starten per toggle-combinatie), vier-ogen-gate in `update()`.
- **E2E** (`ai-review.e2e-spec.ts`, Anthropic-client gemockt): GET/POST/PATCH-flow, feature-gate 403, org-toggle uit → submit start geen run, cross-tenant 403/404, teardown-volgorde met `try/finally`.
- **Portal**: Vitest voor `ai-review-panel` (severity-sortering, afvink-mutatie, poll-status).

## 13.12 Relatie met IMP_PRD_10 (AI-chat) — overlap & afbakening

| Aspect | Dit PRD (13) | PRD-10 §9 / fase 6 (help-chatbot) |
|---|---|---|
| Anthropic-client | Introduceert gedeelde `AnthropicClientService` in `common/` | Hergebruikt die service later |
| Interactievorm | Batch: één run → gestructureerde items (tool-use) | Conversationeel: RAG over KB-artikelen, streaming |
| Prompt-config | Base-constant + `aiReviewInstructions` per org | Nog open (PRD-10 legt bewust niets vast) |
| Org-toggle-patroon | `aiReviewEnabled` (naar voorbeeld `chatEnabled`) | `chatEnabled` bestaat al |
| Datamodel | Eigen `AiReviewRun/Item` | Eigen sessie/message-modellen, later |

Conclusie: de overlap zit uitsluitend in de client-laag en het toggle/entitlement-patroon; er is géén gedeeld datamodel of gedeelde prompt-infra nodig. De refactor van `voice` naar de gedeelde client is de enige aanraking met bestaande AI-code.

## 13.13 Buiten scope / later

- AI-review van **offertes** of andere documenttypen (zelfde `AiReviewRun`-model is er klaar voor via `generatedDocumentId`).
- Foto-analyse (vision) — bijv. "foto toont geen verdeelinrichting".
- Volledig 3-lagen-promptbeheer (superuser-base-prompt-CRUD zoals voice) — nu een code-constant.
- Automatisch her-runnen bij herindiening na afkeuring (nu: reviewer klikt zelf).
- Kosten-quota per org; maandrapportage tokenverbruik.
- AI-suggesties direct als tekstcorrecties in het document toepassen.

## 13.14 Gefaseerde implementatie

| Fase | Inhoud | Migratie? |
|---|---|---|
| 1 | Schema + org-velden + entitlement-key + DTO's + seed-opruimvolgorde | ja |
| 2 | Gedeelde `AnthropicClientService` + voice-refactor + `ai-review`-module (input-builder, prompt, run-service, endpoints) | nee |
| 3 | Integratie: submit-hook, vier-ogen-gate, notificatietype, audit-registratie | ja (enum) |
| 4 | Portal: AI-review-paneel, org-settings, types, hooks | nee |
| 5 | Seed-demo, E2E, Vitest, docs/CLAUDE.md-bijwerking | nee |

De uitvoerbare Claude Code-prompts per fase staan in `docs/IMP_PRD_13_APPLY-WITH-CLAUDE-CODE.md`.
