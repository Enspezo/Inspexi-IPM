# Fase 5 — Beheer-portal GUI (inspectiebeheer)

De inspectie-**beheer**functionaliteit naar de bestaande Beheer-portal (`apps/portal`), in Beheer's GUI-patronen. Backend (Fase 2-4) levert de endpoints; deze fase bouwt de pagina's.

Deliverables in deze map:
- `code/lookups/use-lookups.ts` + `code/lookups/lookup-badge.tsx` — **nieuw, herbruikt overal**: hook + badge voor de per-org lookup-status/types.
- `code/status-additions.ts` — toe te voegen `StatusMap`s voor de lifecycle-**enums** (lib/status.ts).
- `code/inspections/use-inspections.ts` + `inspections-page.tsx` — golden-path overzicht (gespiegeld op `tasks-page.tsx`).

## 0. Wat de portal al heeft (meeliften)
Bevestigd in `apps/portal`: **TipTap** (`rich-text-editor.tsx` + extensions), **@dnd-kit**, `signature-canvas`/`signature-editor`, en alle patroon-bouwstenen (`DetailPageLayout`, `TableConfigSidebar`/`useTableConfig`/`ColumnDef`, `StatusBadge` + `lib/status.ts`, `AuditHistory`, `InfoField`, `Tabs`, `PageHeader`, `Modal`, hooks per domein). **Ontbreekt nog:** `konva`/`react-konva` (floor-plan) — toevoegen in fase 5e.

## 1. Kernpatroon: lookup vs enum (belangrijk)
- **Lookup-velden** (per-org, Fase 1/2): `statusCode` (plan/asset/finding/report), `inspectionTypeCode`, signatory/signer, pass-fail, resolution, client-request → renderen via **`<LookupBadge kind=… code=… />`** (`code/lookups/`). Filteropties komen dynamisch uit `useLookups(kind)`.
- **Lifecycle/structurele enums** (bleven enum): `ChecklistStatus`/`TemplateStatus`/`MeasurementSheetTemplateStatus` (CONCEPT/ACTIEF/VERVALLEN), `InspectionExecStatus`, `MeasurementSheetRecordStatus`, `GeneratedDocumentStatus`, `SignatureStatus` → **`<StatusBadge map=… value=… />`** met de maps uit `code/status-additions.ts`.

## 2. Pagina-inventaris (App-portal → Beheer-portal)
Elke overzichtspagina volgt `tasks-page.tsx`; elke detailpagina volgt het Beheer detail-patroon (`DetailPageLayout` + `AuditHistory`-sidebar + tabs + inline bewerken via react-hook-form/zod). Hooks per domein volgen `use-tasks.ts`.

**Config / templates (groep B):**
| Pagina | Endpoint(s) | Bijzonderheden |
|---|---|---|
| Inspectie-templates (lijst + detail) | `/inspection-templates` | tabs: Configuratie · Checklists · **Document-builder (block-editor)** · Versiehistorie; fork/publish/retire |
| Checklists (+ items, categorieën) | `/checklists`, `/checklist-items`, `/categories` | versiebeheer (StatusBadge `TEMPLATE_STATUS`), `for-asset` |
| Constateringen-templates | `/finding-templates` | FK classificatiemodel + categorie; import/export |
| Classificatiemodellen | `/classification-models` | superuser; kenmerken → opties (kleur) |
| Normtypes | `/norm-types` | superuser; soft-delete + restore |
| Meetstaat-templates | `/measurement-sheet-templates` | superuser; form-builder (secties/velden) |
| Asset-/locatietypes | `/asset-types`, `/location-types` | field/constraint-builder (@dnd-kit reorder); `/merged` |
| **Lookup-beheer** | `/lookups/:kind` | org-admin beheert org-overrides; superuser de defaults |

**Uitvoering / review (groep C):**
| Pagina | Endpoint(s) | Bijzonderheden |
|---|---|---|
| Inspecties (lijst + review-detail) | `/inspection-plans`, `…/review` | **golden path** (`code/inspections/`); LookupBadge-status; submit/review-flow |
| Assets-register | `/assets` | org-breed register (gepagineerd) |
| Floor-plan / locatie-afbeeldingen | `/location-images` (+ markers) | **Konva-canvas** met markers (fase 5e) |
| Documenten per inspectie | `/inspection-plans/:id/documents`, `/generated-documents/*` | genereren/preview/export/ondertekenen (Fase 4-backend) |

## 3. Routes + sidebar + types
- **`App.tsx`**: lazy routes onder `<AppLayout>` voor elke nieuwe pagina (volg het bestaande `React.lazy` + `<Suspense>` patroon).
- **`sidebar.tsx`**: nav-items met rol-gating. Voorstel: een groep **"Inspecties"** (`crmRoles` + INSPECTEUR voor lezen) met Inspecties / Assets, en onder **"Beheer/Templates"** (adminRoles) de config-pagina's. Hergebruik de `roles`-prop op nav-items.
- **`types/index.ts`**: interfaces voor `InspectionPlan`, `Asset`, `Finding`, `Checklist`, `InspectionTemplate`, `MeasurementSheetTemplate`, enz. (spiegel de Fase 1-modellen; velden in camelCase, `statusCode` als string).

## 4. Block-editor (fase 5d — zwaarste stuk)
De document-builder-tab van inspectie-templates. De portal heeft TipTap + @dnd-kit al. Te bouwen: een `components/block-editor/` met de `ContentBlock`-types (rich_text, image, divider, spacer, placeholder, toc, findings_table, asset_summary, measurement_data, signature_block) — neem de structuur over uit de App-portal (`apps/portal/src/components/block-editor` in Inspexi-App) en de gedeelde `block-editor`-types. Slaat op als `DocumentTemplate.contentBlocks` (Fase 4). Plan dit als **aparte sub-fase/PR**; de rest van Fase 5 kan zonder.

## 5. Konva (fase 5e — floor-plan)
`pnpm --filter <portal> add konva react-konva`. Bouw `components/location-image-viewer/` (afbeelding + klikbare markers → asset/measurement/finding), naar het model van de App-portal floor-plan. Aparte sub-fase.

---

## 6. Prompt J — Fase 5 fundament + golden-path overzichten
```
Doel: zet het Beheer-portal-fundament voor het inspectiedomein + de overzichtspagina's neer.

Branch & voorwaarden (eerst checken, niets aanmaken):
- Werk op de al aangemaakte branch `feat/portal-inspection-ui` (afgetakt van de actuele dev).
  Controleer: `git rev-parse --abbrev-ref HEAD` → feat/portal-inspection-ui.
- Verifieer dat de Fase 1-4 backend op deze branch staat (anders eerst dev bijwerken / PR #13 mergen
  en opnieuw aftakken): apps/api/src/modules bevat o.a. `lookups`, `inspection-plans`, `asset-types`,
  `checklists`, `generated-documents`. Zo niet → STOP en meld het.

Lees eerst: docs/fase5/FASE5-PORTAL-GUI.md + docs/fase5/code/, en als template de bestaande
apps/portal/src/pages/tasks (tasks-page.tsx + hooks/use-tasks.ts) en lib/status.ts.

Stappen:
1. Lookup-fundament: voeg src/lib/lookups.ts (useLookups + CRUD) en
   src/components/ui/lookup-badge.tsx toe (uit docs/fase5/code/lookups); exporteer LookupBadge
   via components/ui/index.ts.
2. lib/status.ts: voeg de StatusMaps uit docs/fase5/code/status-additions.ts toe (lifecycle-enums).
3. types/index.ts: voeg de inspectie-interfaces toe (spiegel Fase 1-modellen; statusCode = string).
4. Overzichtspagina's (volg tasks-page.tsx exact): inspections (uit docs/fase5/code/inspections),
   assets-register, checklists, finding-templates, classification-models, norm-types, asset-types,
   location-types, measurement-sheet-templates, inspection-templates. Per domein hooks/use-X.ts.
5. Routes in App.tsx (lazy) + sidebar-items met rol-gating (Inspecties-groep + Templates-groep).
6. Lookup-beheerpagina (/lookups/:kind) voor org-admin (label/kleur/volgorde + eigen codes).

Constraints:
- Lookup-status → <LookupBadge>; lifecycle-enum → <StatusBadge>. Filteropties van lookup-velden
  dynamisch uit useLookups.
- Gebruik bestaande hooks-patroon (geen handmatige fetch in useEffect); apiClient + TanStack Query.
- Detailpagina's: DetailPageLayout + AuditHistory + tabs + inline bewerken (react-hook-form/zod).
- Block-editor (inspectie-template document-builder) en Konva floor-plan: NIET hier — aparte sub-fases.

Definition of done: `npx turbo run build` groen; `pnpm --filter <portal> typecheck` groen;
overzichten tonen data + filters + LookupBadges; navigatie naar detail werkt.

Afronden:
- Commit per logische groep op feat/portal-inspection-ui, bv.
  `feat(portal): lookup hook/badge + status maps (Fase 5)` en
  `feat(portal): inspection overview pages + routes/sidebar (Fase 5)`.
- `git push -u origin feat/portal-inspection-ui`
- `gh pr create --base dev --head feat/portal-inspection-ui --title "Fase 5 — portal inspectie-overzichten"`
- Géén lokale merge in dev; review/merge via de PR.
```

## 7. Prompt K1 — Fase 5d: block-editor (eigen branch)
```
Doel: bouw de document-builder (block-editor) voor inspectie-templates in de Beheer-portal.

Branch & voorwaarden (eerst checken, niets stiekem aanmaken):
- git fetch --all --prune && git switch dev && git pull --ff-only
- git switch -c feat/portal-block-editor          # verse branch vanaf de actuele dev
- Verifieer dat Fase 4 + Fase 5-fundament op dev staan (anders STOP en meld):
  apps/api/src/modules/document-templates en generated-documents bestaan; in de portal bestaan
  src/lib/lookups.ts en de inspectie-overzichtspagina's (PR #14 gemerged).

Lees eerst: docs/fase4/FASE4-DOCGEN.md (DocumentTemplate.contentBlocks + TemplateMode),
de gedeelde block-editor-types, en als bron ../Inspexi-App/apps/portal/src/components/block-editor.

Stappen:
1. components/block-editor/: ContentBlock-types + per-block renderers — rich_text (TipTap, al in de
   portal aanwezig), image, divider, spacer, placeholder, toc, findings_table, asset_summary,
   measurement_data, signature_block. Volgorde via @dnd-kit (al aanwezig). Port de logica uit de App.
2. Inspectie-template-detailpagina: bouw 'm (Beheer detail-patroon: DetailPageLayout + AuditHistory +
   tabs) als die nog niet bestaat, met een tab "Document-builder" die de block-editor host.
3. Opslaan/laden via de document-templates endpoints (Fase 4): contentBlocks op de PLAN/REPORT-
   DocumentTemplate; templateMode = BLOCKS. Preview via de Fase 4 preview-endpoint.

Constraints: Tailwind v4 + custom componenten (géén shadcn); hergebruik bestaande ui-componenten en
rich-text-editor.tsx. Geen handmatige fetch in useEffect — hooks + apiClient + TanStack Query.

Verificatie & afronden:
- `pnpm --filter <portal> typecheck` + `npx turbo run build` groen; een template met blokken bewerken
  → opslaan → Fase 4-preview rendert correct.
- Commit op feat/portal-block-editor; `git push -u origin feat/portal-block-editor`;
  `gh pr create --base dev --head feat/portal-block-editor --title "Fase 5d — block-editor"`.
- Géén lokale merge in dev.
```

## 8. Prompt K2 — Fase 5e: Konva floor-plan (eigen branch)
```
Doel: bouw de floor-plan / locatie-afbeelding-viewer met klikbare markers in de Beheer-portal.

Branch & voorwaarden:
- git fetch --all --prune && git switch dev && git pull --ff-only
- git switch -c feat/portal-floorplan              # verse branch vanaf de actuele dev
- Verifieer dat de location-images backend (Fase 2) op dev staat:
  apps/api/src/modules/location-images bestaat. Zo niet → STOP en meld.

Lees eerst: docs/fase2 (location-images + markers) en als bron
../Inspexi-App/apps/portal/src/components/location-image-viewer (Konva-canvas + markers).

Stappen:
1. pnpm --filter <portal> add konva react-konva
2. components/location-image-viewer/: afbeelding op een Konva-canvas, klikbare markers met type
   asset|measurement|finding (kleur/icoon per type via de lookups), toevoegen/verslepen/verwijderen.
3. Koppelen aan de endpoints: GET/POST/DELETE /location-images (+ markers); upload via de bestaande
   authenticated-upload/-download-route. Inbouwen op de inspectie-locatie-detail of een eigen pagina.

Constraints: Tailwind v4 + custom componenten; lookups-gedreven marker-labels/-kleuren via useLookups.

Verificatie & afronden:
- typecheck + build groen; een afbeelding tonen, markers plaatsen + opslaan, herladen toont ze terug.
- Commit op feat/portal-floorplan; push -u; `gh pr create --base dev --head feat/portal-floorplan
  --title "Fase 5e — floor-plan viewer"`. Géén lokale merge in dev.
```

---

## 8. Verificatie
- `pnpm --filter <portal> typecheck` + `npx turbo run build` groen.
- Overzichten: data, filters (incl. dynamische lookup-filters), `<LookupBadge>` met juiste label/kleur.
- Detail: tabs + inline bewerken + `AuditHistory`; inspectie-review (approve/reject) werkt.
- Tenant/branding: pagina's draaien onder `TenantProvider` (org-subdomein) — geen hardcoded org.
- Rol-gating: INSPECTEUR ziet lezen-pagina's; config/templates alleen voor admin-rollen.

## 9. Open punten
- **Block-editor** is de grootste brok — eigen sub-fase/PR (5d).
- **Konva** moet als dep erbij (5e).
- **Recharts** (dashboard-grafieken) niet aanwezig — alleen toevoegen als je een inspectie-dashboard wilt.
- **Welke pagina's eerst?** Aanbevolen volgorde: lookup-fundament → inspecties + assets (review/uitvoering, meeste waarde) → config/templates → block-editor → floor-plan.
- Inspectie-template document-builder hangt aan Fase 4 (DocumentTemplate); zorg dat Fase 4 op dev staat vóór 5d.
