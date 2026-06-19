# Migratie-notitie — Inspectiedomein Fase 1 + 2

> Status van de integratie **Inspexi-App → InspeXi-Beheer** na Fase 1 (schema-fundament) en
> Fase 2 (API kern-inspectiedomein). Opgesteld als pre-merge verificatie van branch
> `feat/db-optimizations`. Het volledige plan staat in [`INTEGRATIE-INSPEXI-APP.md`](./INTEGRATIE-INSPEXI-APP.md) (§12).
>
> Datum: 2026-06-14 · Basis: `origin/main`

---

## 1. Verificatieresultaat (pre-merge)

| # | Controle | Resultaat |
|---|---|---|
| 1 | `npx turbo run build` (root) | ✅ groen — `nest build` + `vite build`, TS + Prisma-client zonder fouten |
| 2 | API unit-tests (`pnpm test`) | ✅ **935/935** geslaagd, 63 suites |
| 2 | API E2E-tests (`pnpm test:e2e`, serieel) | ✅ **436/436** geslaagd, 32 suites (incl. cross-tenant FK-injectie) |
| 3 | Swagger `/api/docs` | ✅ alle 21 nieuwe controllers hebben `@ApiTags` + `@ApiBearerAuth`; geen ongewenst publieke endpoints |
| 4 | Seed-rooktest | ✅ 11 lookup-tabellen met systeemdefaults (50 rijen); demo-inspectieplan + 2 assets + 2 findings |
| 5 | Tenant-audit (20 services) | ✅ `orgScope`/`assertSameOrg`/`deletedAt: null` consistent toegepast; geen cross-tenant lek |

> Eén unit-test was bij aanvang rood (`checklists.service.spec.ts` — ontbrekende
> `checklistVersionHistory.deleteMany`-mock na de delete-cascade fix in `8f1e704`). Hersteld in deze
> verificatie; geen productiecode geraakt.

---

## 2. Wat staat live (Fase 1 + 2)

### Database / Prisma (Fase 1)
- **72 nieuwe modellen** toegevoegd aan `apps/api/prisma/schema.prisma` — het **volledige**
  inspectiedomein, inclusief modellen die pas in latere fasen een API/GUI krijgen
  (sync, document-generatie, client-portal, voice).
- Migraties: `20260614054454_add_inspection_domain` + `20260614073634_add_inspection_plan_notification_types`.
- Beheer-conventies overal toegepast: `imp_`-prefix, `uuid @db.Uuid`, `orgId`/`org_id`,
  soft-delete via `deletedAt` (geen middleware — filter staat expliciet per query).
- Audit-trail uitgebreid: nieuwe kernmodellen in `AUDITED_MODELS` + `MODEL_TABLE_MAP`
  (`prisma.service.ts`).
- `apps/portal/src/types/index.ts` uitgebreid met de TypeScript-interfaces (**alleen types — nog geen GUI**).

### API-modules (Fase 2) — 20 stuks
`asset-types`, `assets`, `categories`, `checklists` (+ items), `classification-models`,
`finding-templates`, `findings`, `inspection-locations`, `inspection-plans`,
`inspection-templates`, `location-images`, `location-types`, `lookups`, `measurement-records`,
`measurement-sheet-records`, `measurement-sheet-templates`, `norm-types`, `portal-stats`,
`standalone-measurements`, `visual-inspections`.

- Multi-tenant: erven globale `JwtAuthGuard → RolesGuard → TenantGuard`; FK-cross-tenant-validatie
  via `assertSameOrg`/`assertAllSameOrg`; globale registries (norm-types,
  classification-models, measurement-sheet-templates) write-locked op `SUPERUSER`.
- Storage: **`R2StorageProvider`** toegevoegd achter de bestaande `STORAGE_PROVIDER`-interface
  (`LocalStorageProvider` blijft default).

### Lookups & seed
- **11 lookup-tabellen** (per-org, nullable `orgId` + `isSystem`) met systeemdefaults:
  inspection-types, plan/asset/finding/report-status, signatory-types, signer-roles,
  pass/fail-status, resolution-status, client-request-types, client-request-status.
- Seed (`seed.ts` + `seed-lookups.ts`): lookup-defaults, 2 classificatiemodellen, 6 normtypes,
  asset-/locatietypes, 1 checklist (+2 items), 1 meetstaat-template, 1 inspectie-template en een
  **demo-inspectieplan met 2 assets + 2 findings**.

---

## 3. Wat schuift naar Fase 3–8

> Belangrijk: het **schema** voor onderstaande domeinen staat al in de DB (Fase 1). Wat ontbreekt
> is de **API-laag en/of GUI**. Modellen zoals `SyncQueue`, `DeviceRegistration`,
> `DocumentTemplate`, `GeneratedDocument`, `Report`, `Signature`, `Photo`, `ClientUser`,
> `ClientAccess`, `ClientMagicLink`, `InspectionMessage`, `ClientRequest`, `VoiceBasePrompt`,
> `VoiceTemplatePrompt` bestaan al maar hebben nog **geen module**.

| Fase | Inhoud | Status |
|---|---|---|
| **3. Sync + PWA-contract** | `sync` (`/sync/pull,push,resolve`) + `photos/upload` + referentie-endpoints; `X-Device-ID`/CORS | Schema ✅ · API ❌ |
| **4. Document-generatie** | `document-templates`, `generated-documents`, block-editor, Puppeteer/Handlebars/Word, publieke ondertekening, Resend | Schema ✅ · API ❌ |
| **5. Beheer-portal GUI** | Inspectiebeheer-pagina's in Beheer-patronen; TipTap/Konva-deps; Tailwind v4 | Alleen types ✅ · GUI ❌ |
| **6. Client-portal (4e app) + 2e realm** | `apps/client-portal`, `client-auth` (`ClientUser`), `ClientAccess → Contact` | Schema ✅ · App/API ❌ |
| **7. Voice-input** | `voice`/`voice-prompts` + `@anthropic-ai/sdk`, 3-laags promptmodel | Schema ✅ · API ❌ |
| **8. Hardening** | Deploy (Chromium-image), env-vars, extra tests/audit-wiring, docs | Lopend |

---

## 4. Aandachtspunten voor de PR (non-blocking)

- **Swagger-tagcasing**: `Findings` en `Lookups` wijken af van de kebab-case van de overige tags;
  `checklist-items` deelt bewust de `checklists`-tag. Puur cosmetisch.
- **Meetstaat section/field-services** (`measurement-sheet-sections/-fields.service.ts`) hebben geen
  eigen rol-/org-check en leunen volledig op `SUPERUSER`-gating in de controller. Correct nu, maar
  latent risico bij hergebruik vanuit een andere controller — overweeg een code-comment.
- **`portal-stats`** mengt `deletedAt: null` (nieuw domein) met legacy `isDeleted: false` (contact);
  bewust en correct per model.
- **Niet meegecommit in deze branch** (los van Fase 1+2): `docs/adr/` (ADR-001/002) en de wijziging
  in `docs/APPLY-WITH-CLAUDE-CODE.md`.
- **Open productvraag** (§11.5 integratieplan): genereert een gewonnen offerte/aanvraag automatisch
  een inspectieplan? Verdient een eigen ontwerp vóór Fase 5/6.

---

## 5. Conclusie

Fase 1 + 2 zijn **functioneel compleet en groen**: één DB/schema, kern-API draait multi-tenant,
vers geseed, getest (unit + E2E + cross-tenant). Branch is klaar voor PR. De resterende domeinen
(sync, document-generatie, portal-GUI, client-portal, voice) staan schema-technisch klaar en
worden in Fase 3–8 van een API/GUI voorzien.
