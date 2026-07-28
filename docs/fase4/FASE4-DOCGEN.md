# Fase 4 — Document-generatie (plan/rapport, PDF/Word, ondertekening)

Uitwerking van **Fase 4**: het overnemen van het documentdomein uit Inspexi-App. De Prisma-modellen bestaan al sinds Fase 1 (`DocumentTemplate`, `DocumentTemplateDocxRevision`, `DocumentSection`, `GeneratedDocument`, `DocumentSignature`, `ReportTemplate`, `Report`). Fase 4 brengt de **API + render-infra** erbij, plus de in Fase 2/3 uitgestelde **foto-thumbnails + signed URLs**.

Bron in de App (~4.800 regels): `document-templates/` (1404), `document-generation/` (2250, service-only), `generated-documents/` (1182). Dit zijn deels zware render-internals (Handlebars-helpers, block-renderers, TOC) — de referentiecode hier legt de **conventies, structuur en de security-kritische delen** vast; de render-details worden uit de App-bron geport (gemarkeerd met `>>> PORT FROM APP SOURCE <<<`).

Deliverables in deze map:
- `code/document-generation/` — `pdf-generation` (Puppeteer), `word-export` (html-docx-js), `document-render` (Handlebars-skelet), module.
- `code/generated-documents/` — controller (incl. **publieke** signature-requests), service-skelet (volledige lifecycle + signing), dto, module.
- `code/photos/thumbnail.util.ts` — thumbnail (sharp) + signed-URL-integratiepunt.
- `document-templates` — beschreven (§3); volgt het asset-types config-/sub-resource-patroon.

---

## 1. Scope & modules

| Module | Inhoud | Patroon |
|---|---|---|
| **document-generation** (service-only) | HTML→PDF (Puppeteer), HTML→Word (html-docx-js), HTML-render (Handlebars: secties/blocks/placeholders/TOC) | nieuw infra-skelet + PORT |
| **document-templates** | plan/rapport-template per inspection-template; secties (CRUD/reorder); DOCX-revisies (upload/download); `migrate-to-blocks`; HTML-preview | config + sub-resources (= asset-types golden path) |
| **generated-documents** | genereren (plan/rapport), bewerken, finaliseren, export PDF/Word, ondertekenen; **publiek** `signature-requests` | uitvoering + publieke endpoint |
| **photos** (uitbreiding) | thumbnail-generatie (sharp) + signed URLs | kleine patch |

---

## 2. Render-infra (`code/document-generation/`)

- **`PdfGenerationService`** (Puppeteer): één gedeelde `Browser`-instance, `renderPdf(html, opts)` met marges/header/footer. `--no-sandbox` + `--disable-dev-shm-usage` voor containers. Pad via `PUPPETEER_EXECUTABLE_PATH`.
- **`WordExportService`** (html-docx-js): `htmlToDocx(html, {stylesCss})` → Buffer.
- **`DocumentRenderService`** (Handlebars): `renderHtml(template, sections, context)` met drie modi — `SECTIONS` (Handlebars + repeterende secties), `BLOCKS` (block-editor `ContentBlock[]`), `DOCX` (rendert niet via HTML; export gebruikt de geüploade revisie). **PORT**: helpers (`handlebars-setup.ts`), block-renderers en `toc-generator.ts` uit de App.

> De `DocumentContext` wordt opgebouwd uit het inspectieplan + relaties (organisatie, contact, assets, findings, metingen). De exacte velden/placeholders staan in de App-render-service — overnemen.

---

## 3. document-templates (volg asset-types golden path)

Geen aparte referentiecode nodig — neem het **config + sub-resource patroon** van `apps/api/src/modules/asset-types` (fields/constraints) over. Endpoint-map (Beheer-conventies, `{success,data}`, `@Roles`):

- `GET/PUT /inspection-templates/:id/plan-template` · `.../report-template` — de twee `DocumentTemplate`s ophalen/zetten (org-of-systeem net als de inspection-template).
- `GET .../plan-template/preview` · `.../report-template/preview` — HTML-preview (render met dummy/laatste context).
- Secties: `GET/POST /document-templates/:id/sections`, `PATCH/DELETE .../sections/:sectionId`, `POST .../sections/reorder` — exact het fields-sub-resource-patroon van asset-types.
- DOCX-revisies: `POST /document-templates/:id/docx` (multipart .docx, max 50MB, via `STORAGE_PROVIDER`), `GET .../docx/revisions`, `GET .../docx/revisions/:revisionId/download` (auth-stream), `DELETE .../docx/revisions/:revisionId`.
- `POST /document-templates/:id/migrate-to-blocks` — zet `SECTIONS` om naar `BLOCKS` (port migratie-logica uit App).

Tenant: templates hangen aan de inspection-template (org-of-systeem); pas dezelfde `assertManageable`/org-of-systeem-check toe als bij asset-types.

---

## 4. generated-documents (`code/generated-documents/`)

Volledige lifecycle in het service-skelet (tenant-safe via `orgScope`), met PORT-markers voor de context-opbouw:

- `generateDocument(planId, type)` → DocumentTemplate ophalen + render → `GeneratedDocument` (DRAFT).
- `updateEditedContent` (geblokkeerd na FINALIZED), `finalizeDocument`, `delete`.
- `generatePreview` (PDF-buffer, niet opgeslagen — gestreamd), `getHtmlContent`.
- `exportToPdf` / `exportToWord` → render → `STORAGE_PROVIDER.upload` → url op het record.
- **Ondertekening**: `requestSignature` (maakt `DocumentSignature` met `signatureRequestId` + verstuurt e-mail via **Beheer's `EmailService`/Resend** met `PUBLIC_URL/sign/:requestId`), `signDocument` (ingelogde user).
- **Publiek** (`SignatureRequestsController`, `@Public()` + strikte `@Throttle`): `GET /signature-requests/:requestId` (verzoek inzien) en `POST /signature-requests/:requestId/sign` (extern ondertekenen). Dit is de enige publieke schrijf-route — bewust streng gerate-limit, geen org-data lekken (alleen het document-HTML + ondertekenvelden).

`signerRoleCode` verwijst naar de lookup `imp_signer_roles` (Fase 1/2). Validatie via `LookupService` (optioneel toevoegen).

---

## 5. Foto-thumbnails + signed URLs (`code/photos/thumbnail.util.ts`)

Vult de in Fase 3 uitgestelde punten:
- **Thumbnail**: bij `photos.service.upload()` met `sharp` een 400px-JPEG maken → aparte key `{orgId}/photos/thumb/...` → `Photo.thumbnailPath`.
- **Signed URLs**: waar de provider `supportsSignedUrls()` heeft (R2), geef in pull/upload een getekende URL i.p.v. de auth-download-route. Lokaal blijft de download-route.

---

## 6. Dependencies & deploy

```
pnpm --filter <api> add puppeteer handlebars html-docx-js sharp
pnpm --filter <api> add -D @types/html-docx-js
```
Env: `PUPPETEER_EXECUTABLE_PATH` (productie), `PUBLIC_URL` (signeer-links), evt. `R2_*` (Fase 2).

**Deploy (belangrijk)**: Puppeteer heeft een **Chromium-binary** nodig. Opties: (a) `puppeteer` laat 'm meebundelen (grotere image), of (b) systeem-Chromium installeren in de Docker-image en `PUPPETEER_EXECUTABLE_PATH` zetten. PDF-generatie is CPU/geheugen-intensief — overweeg een aparte worker/queue als volume groeit (nu: synchroon in-request, zoals de App). Documenteer in `docs/DEPLOYMENT`.

**Deploy-fonts (B-312, WP-C4)**: installeer **`fonts-noto-cjk`** in dezelfde image als de Chromium-binary. Chromium tekent géén glyph voor tekens zonder beschikbaar font (geen tofu-blokjes — de tekens verdwijnen stil), dus zonder CJK-font vallen bv. Chinese tekens uit project-/relatienamen weg uit elk gegenereerd PDF-document. De render-CSS verwijst sinds WP-C4 expliciet naar `'Noto Sans CJK SC'` in alle font-stacks. Let op: dit is **alleen te testen in de echte container-image** — op macOS/desktop gedraagt de fallback zich anders. De `apps/convert-api`-image (LibreOffice, DOCX⇄PDF) installeert `fonts-noto-cjk` al in z'n Dockerfile; de API-image heeft (nog) geen Dockerfile in de repo, dus dit is daar een expliciete deploy-vereiste.

---

## 7. Prompt H — Claude Code: render-infra + document-templates (Beheer-repo)

```
Doel: implementeer de document-render-infra + document-templates in apps/api.
Lees eerst: docs/fase4/FASE4-DOCGEN.md (§2,§3) + docs/fase4/code/document-generation/, en de
App-bron ../Inspexi-App/apps/api/src/modules/document-generation + document-templates.

Stappen:
1. Maak src/modules/document-generation/ (pdf/word/render + module) uit docs/fase4/code; PORT de
   Handlebars-helpers, block-renderers en toc-generator uit de App-bron (>>> PORT-markers).
2. Maak src/modules/document-templates/ volgens het asset-types golden-path patroon
   (templates + secties als sub-resource + DOCX-revisie-upload via STORAGE_PROVIDER + preview +
   migrate-to-blocks). Endpoint-map: zie §3.
3. Voeg deps toe (puppeteer, handlebars, html-docx-js, sharp + @types/html-docx-js); .env.example
   uitbreiden (PUPPETEER_EXECUTABLE_PATH). Registreer modules in app.module.ts.
4. Unit-specs (render-mode-keuze, sectie/blocks; template CRUD/sections/docx) + e2e.

Constraints: Beheer-conventies; tenant org-of-systeem voor templates; DOCX-mode rendert niet via
HTML. PDF-generatie achter een service, browser-instance hergebruiken.

Definition of done: `npx turbo run build` groen; unit + e2e groen; preview levert echte PDF/HTML.
Commit: `feat: document render infra + templates (Fase 4)`.
```

## 8. Prompt I — Claude Code: generated-documents + signing + foto-thumbnails (Beheer-repo)

```
Doel: implementeer generated-documents (lifecycle + ondertekening) + foto-thumbnails/signed-URLs.
Lees eerst: docs/fase4/FASE4-DOCGEN.md (§4,§5) + docs/fase4/code/generated-documents/ en
docs/fase4/code/photos/thumbnail.util.ts, en de App-bron generated-documents.service.ts.

Stappen:
1. Maak src/modules/generated-documents/ (controller incl. publieke SignatureRequestsController,
   service-skelet, dto, module) uit docs/fase4/code. PORT de DocumentContext-opbouw + render-
   aanroepen uit de App-bron. Importeer DocumentGenerationModule.
2. requestSignature: koppel aan Beheer's EmailService (Resend) — mail met PUBLIC_URL/sign/:id.
3. Publieke endpoints @Public() + strikte @Throttle; lek geen org-data (alleen document-HTML +
   ondertekenvelden). signerRoleCode evt. via LookupService valideren.
4. Foto-thumbnails: voeg sharp toe; in photos.service.upload() thumbnail genereren + thumbnailPath
   zetten; signed URLs waar de provider ze ondersteunt (anders download-route).
5. Registreer GeneratedDocumentsModule in app.module.ts. Voeg GeneratedDocument toe aan
   AUDITED_MODELS (optioneel). Seed: 1 document-template voor de demo-inspection-template.
6. Unit + e2e: generate→edit→finalize→export; request-signature→public sign happy path;
   cross-tenant (vreemd plan/doc → 403); publieke sign rate-limit.

Definition of done: `npx turbo run build` groen; unit + e2e + cross-tenant groen; een gegenereerd
plan exporteert naar PDF én Word; publieke ondertekenlink werkt end-to-end.
Commit: `feat: generated documents + signing + photo thumbnails (Fase 4)`.
```

---

## 9. Verificatie
- `tsc --noEmit` + unit + e2e groen; cross-tenant: vreemd plan/document → 403.
- Genereer een plan → preview (PDF) → export PDF + Word (bestanden in storage, urls op record).
- Ondertekenflow: `request-signature` → publieke `GET/POST /signature-requests/:id` → `DocumentSignature` SIGNED; document → SIGNED/FINALIZED.
- Foto-upload zet nu een echte `thumbnailPath`; pull/preview geeft (signed) URLs.
- Deploy-rooktest: Puppeteer vindt Chromium (PUPPETEER_EXECUTABLE_PATH) in de container.

## 10. Open punten
- **Worker/queue voor PDF** als het volume groeit (nu synchroon).
- **DOCX-mode export**: levert de geüploade revisie terug i.p.v. HTML-render — bevestig de gewenste flow.
- **PWA-documentdomein**: lijnt hier uit (lost de pre-existing PWA documents/*-typefouten op) — plan dat als PWA-PR (raakt aan Fase 6 client-portal voor klant-ondertekening).
- **Report vs GeneratedDocument**: het oudere `Report`/`ReportTemplate`-model bestaat naast `GeneratedDocument`. Bevestig of `Report` nog gebruikt wordt of kan vervallen.
